import { and, eq, inArray, isNull } from 'drizzle-orm'
import {
  CommException,
  Inject,
  Provide,
} from '/#/server'
import { randomBytes } from 'node:crypto'
import { getAiAdapter } from '../lib/ai/adapters'
import type {
  AiCallRequest,
  AiCallResult,
  AiCapability,
  AiInvokeInput,
  AiInvokeResult,
  AiProtocolAdapter,
  AiResultMode,
  AiStreamChunk,
} from '../lib/ai/types'
import {
  AI_TIMEOUT_DEFAULT_MS,
  inferAiMode,
  mergeAbortSignal,
  normalizeAiContentType,
  requireAsyncSpec,
  resolveAiCapability,
  resolveAiTimeoutMs,
  stripAiDefaultMeta,
} from '../lib/ai/types'
import { aiCallLog } from '../entity/call-log'
import { AiCallLogService, buildAiCallLogRequest, buildAiCallLogResult } from './call-log'
import { AiModelService } from './model'
import { AiProviderService } from './provider'

const DEFAULT_TASK_TIMEOUT_MS = 3_600_000

function newRecordKey() {
  return `ait_${Date.now().toString(36)}_${randomBytes(6).toString('hex')}`
}

function modelTimeoutOf(defaults: Record<string, unknown> | null | undefined) {
  const n = Number(defaults?.timeoutMs)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

@Provide()
export class AiGateway {
  @Inject()
  modelService: AiModelService

  @Inject()
  providerService: AiProviderService

  @Inject()
  callLogService: AiCallLogService

  /**
   * 统一入口：按模型配置推断 sync / stream / async；
   * 传 taskId 则查询异步进度。
   */
  async call(
    req: AiCallRequest,
    meta: { source?: string } = {},
  ): Promise<AiCallResult> {
    if (req.taskId) {
      void this.closeStaleTasks()
      const data = await this.refreshAndGetRecord(req.taskId)
      return {
        kind: 'json',
        ok: data.status !== 'failed',
        capability: data.capability,
        model: data.model || req.model,
        mode: 'async',
        data: {
          taskId: data.taskId,
          status: data.status,
          upstreamId: data.upstreamId,
          ...(data.result && typeof data.result === 'object'
            ? (data.result as Record<string, unknown>)
            : {}),
        },
        error: data.error
          ? { code: 'task', message: data.error }
          : undefined,
      }
    }

    if (!req.model) throw new CommException('model 不能为空')

    const started = Date.now()
    const source = meta.source ?? 'gateway'

    try {
      const resolved = await this.resolve(req)
      const { capability, model, adapter, mode, ctx } = resolved
      const input = (req.input ?? {}) as AiInvokeInput

      if (mode === 'stream') {
        if (!adapter.stream) {
          throw new CommException('当前协议不支持流式')
        }
        const baseStream = adapter.stream(capability, input, ctx)
        const logRequest = buildAiCallLogRequest(
          req.model,
          capability,
          input as Record<string, unknown>,
          req.options?.stream != null ? { stream: req.options.stream } : undefined,
        )
        return {
          kind: 'stream',
          capability,
          model: req.model,
          mode: 'stream',
          stream: this.wrapStreamLog(baseStream, {
            modelCode: req.model,
            capability,
            source,
            started,
            request: logRequest,
          }),
        }
      }

      let result: AiInvokeResult
      if (mode === 'async') {
        result = await this.createAsyncRecord(
          req,
          capability,
          model.code,
          adapter,
          ctx,
          source,
        )
      } else {
        result = await adapter.invoke(capability, mode, input, ctx)
        result = { ...result, model: req.model, mode }
        const logRequest = buildAiCallLogRequest(
          req.model,
          capability,
          input as Record<string, unknown>,
        )
        void this.callLogService.write({
          modelCode: req.model,
          capability,
          mode,
          ok: result.ok,
          latencyMs: Date.now() - started,
          usage: result.usage,
          error: result.error,
          source,
          request: logRequest,
          result: buildAiCallLogResult({
            ok: result.ok,
            data: (result.data as Record<string, unknown> | undefined) ?? null,
            usage: result.usage ?? null,
            error: result.error ?? null,
            raw: result.raw,
          }),
        })
      }

      return { kind: 'json', ...result }
    } catch (e) {
      void this.callLogService.write({
        modelCode: req.model,
        capability: req.capability ?? 'unknown',
        mode: 'sync',
        ok: false,
        latencyMs: Date.now() - started,
        error: {
          code: 'gateway',
          message: e instanceof Error ? e.message : String(e),
        },
        source,
        request: buildAiCallLogRequest(
          req.model,
          req.capability ?? 'unknown',
          (req.input ?? {}) as Record<string, unknown>,
        ),
        result: buildAiCallLogResult({
          ok: false,
          error: {
            code: 'gateway',
            message: e instanceof Error ? e.message : String(e),
          },
        }),
      })
      throw e
    }
  }

  async retryAsync(recordKey: string) {
    const row = await this.callLogService.findByRecordKey(recordKey)
    if (!row) throw new CommException('记录不存在')
    if (row.mode !== 'async') throw new CommException('仅异步记录可重试')
    if (row.status !== 'failed') throw new CommException('仅失败任务可重试')
    if (!row.modelCode) throw new CommException('记录缺少 modelCode')

    const resolved = await this.resolve({
      model: row.modelCode,
      capability: row.capability as AiCapability,
      input: (row.request ?? {}) as Record<string, unknown>,
    })
    const created = await resolved.adapter.invoke(
      row.capability as AiCapability,
      'async',
      (row.request ?? {}) as AiInvokeInput,
      resolved.ctx,
    )
    if (!created.ok) {
      throw new CommException(created.error?.message ?? '重试创建失败')
    }
    const upstreamId = String(created.data?.taskId || '')
    if (!upstreamId) throw new CommException('上游未返回任务 id')

    await this.callLogService.updateByRecordKey(recordKey, {
      status: 'pending',
      upstreamId,
      errorCode: null,
      errorMessage: null,
      result: buildAiCallLogResult({
        ok: true,
        data: (created.data as Record<string, unknown> | undefined) ?? null,
        raw: created.raw,
      }),
      ok: 1,
    })
    return { taskId: recordKey, upstreamId, status: 'pending' }
  }

  private async *wrapStreamLog(
    stream: AsyncGenerator<AiStreamChunk>,
    meta: {
      modelCode: string
      capability: AiCapability
      source: string
      started: number
      request: Record<string, unknown>
    },
  ): AsyncGenerator<AiStreamChunk> {
    let usage: AiInvokeResult['usage']
    let failed: { code: string; message: string } | undefined
    let text = ''
    let data: Record<string, unknown> | undefined
    try {
      for await (const chunk of stream) {
        if (chunk.text) text += chunk.text
        if (chunk.data && typeof chunk.data === 'object') {
          data = { ...data, ...(chunk.data as Record<string, unknown>) }
        }
        if (chunk.usage) usage = chunk.usage
        if (chunk.type === 'error') failed = chunk.error
        yield chunk
      }
    } finally {
      const responseData =
        text || data
          ? {
              ...(data ?? {}),
              ...(text ? { text } : {}),
            }
          : null
      void this.callLogService.write({
        modelCode: meta.modelCode,
        capability: meta.capability,
        mode: 'stream',
        ok: !failed,
        latencyMs: Date.now() - meta.started,
        usage,
        error: failed,
        source: meta.source,
        request: meta.request,
        result: buildAiCallLogResult({
          ok: !failed,
          data: responseData,
          usage: usage ?? null,
          error: failed ?? null,
        }),
      })
    }
  }

  private async resolve(req: AiCallRequest) {
    const model = await this.modelService.findEnabledByCode(req.model)
    if (!model) throw new CommException(`模型不存在或未启用: ${req.model}`)

    let capability: AiCapability
    try {
      capability = resolveAiCapability(req.capability, model.capabilities)
    } catch (e) {
      throw new CommException(e instanceof Error ? e.message : String(e))
    }

    let mode: AiResultMode
    try {
      mode = inferAiMode(capability, model.resultModes)
    } catch (e) {
      throw new CommException(e instanceof Error ? e.message : String(e))
    }
    if (capability === 'chat' && req.options?.stream === false) mode = 'sync'
    if (capability === 'chat' && req.options?.stream === true) {
      if (!(model.resultModes ?? []).includes('stream')) {
        throw new CommException('模型未启用 stream')
      }
      mode = 'stream'
    }

    if (mode === 'async') {
      try {
        requireAsyncSpec(model.asyncSpec)
      } catch (e) {
        throw new CommException(e instanceof Error ? e.message : String(e))
      }
    }

    const provider = await this.providerService.getDecrypted(model.providerId)
    if (provider.status !== 1) throw new CommException('AI 连接已停用')
    const baseUrl = String(provider.baseUrl ?? '').trim()
    if (!baseUrl) throw new CommException('AI 连接未配置接口地址')
    if (!provider.apiKey) throw new CommException('AI 连接未配置密钥')

    const path = String(model.path ?? '').trim()
    if (!path) throw new CommException('模型未配置请求路径')

    const adapter = getAiAdapter(provider.protocol)
    if (!adapter) {
      throw new CommException(`未实现协议适配器: ${provider.protocol}`)
    }

    const timeoutMs = resolveAiTimeoutMs(
      mode,
      req.options?.timeoutMs,
      modelTimeoutOf(model.defaults),
    )
    const signal = mergeAbortSignal(timeoutMs, req.options?.signal)

    return {
      model,
      provider,
      adapter,
      capability,
      mode,
      timeoutMs,
      ctx: {
        baseUrl,
        apiKey: provider.apiKey,
        modelId: model.code,
        path,
        method: String(model.method ?? 'POST').trim().toUpperCase() || 'POST',
        contentType: normalizeAiContentType(model.contentType),
        asyncSpec: model.asyncSpec ?? null,
        extra: provider.extra,
        defaults: stripAiDefaultMeta(model.defaults),
        signal,
      },
    }
  }

  private async refreshAndGetRecord(recordKey: string) {
    const row = await this.callLogService.findByRecordKey(recordKey)
    if (!row) throw new CommException('记录不存在')

    const terminal = row.status === 'succeeded' || row.status === 'failed'
    if (!terminal && row.upstreamId && row.modelCode) {
      await this.refreshUpstreamRecord(row)
      const fresh = await this.callLogService.findByRecordKey(recordKey)
      if (fresh) {
        return {
          taskId: fresh.recordKey,
          status: fresh.status,
          capability: fresh.capability as AiCapability,
          model: fresh.modelCode,
          result: fresh.result,
          error: fresh.errorMessage,
          upstreamId: fresh.upstreamId,
        }
      }
    }

    return {
      taskId: row.recordKey,
      status: row.status,
      capability: row.capability as AiCapability,
      model: row.modelCode,
      result: row.result,
      error: row.errorMessage,
      upstreamId: row.upstreamId,
    }
  }

  private async createAsyncRecord(
    req: AiCallRequest,
    capability: AiCapability,
    modelCode: string,
    adapter: AiProtocolAdapter,
    ctx: Awaited<ReturnType<AiGateway['resolve']>>['ctx'],
    source: string,
  ): Promise<AiInvokeResult> {
    const created = await adapter.invoke(
      capability,
      'async',
      (req.input ?? {}) as AiInvokeInput,
      ctx,
    )
    if (!created.ok) {
      void this.callLogService.write({
        modelCode: modelCode,
        capability,
        mode: 'async',
        ok: false,
        error: created.error,
        source,
        request: buildAiCallLogRequest(
          modelCode,
          capability,
          (req.input ?? {}) as Record<string, unknown>,
        ),
        result: buildAiCallLogResult({
          ok: false,
          data: (created.data as Record<string, unknown> | undefined) ?? null,
          error: created.error ?? null,
          raw: created.raw,
        }),
      })
      return { ...created, model: modelCode, mode: 'async' }
    }

    const upstreamId = String(created.data?.taskId || '')
    if (!upstreamId) {
      throw new CommException('上游未返回任务 id')
    }

    const status = String(created.data?.status || 'pending')
    const recordKey = newRecordKey()
    const normalizedStatus =
      status === 'succeeded' || status === 'failed' || status === 'running'
        ? status
        : 'pending'

    await this.callLogService.createAsyncRecord({
      recordKey,
      modelCode,
      capability,
      status: normalizedStatus,
      upstreamId,
      request: buildAiCallLogRequest(
        modelCode,
        capability,
        (req.input ?? {}) as Record<string, unknown>,
      ),
      result: buildAiCallLogResult({
        ok: normalizedStatus !== 'failed',
        data: (created.data as Record<string, unknown> | undefined) ?? null,
        raw: created.raw,
      }),
      source,
      ok: normalizedStatus !== 'failed',
    })

    return {
      ok: true,
      capability,
      model: modelCode,
      mode: 'async',
      data: {
        taskId: recordKey,
        status: normalizedStatus === 'succeeded' ? 'succeeded' : 'pending',
        upstreamId,
        progress: created.data?.progress,
      },
      raw: created.raw,
    }
  }

  private async refreshUpstreamRecord(row: typeof aiCallLog.$inferSelect) {
    if (!row.modelCode || !row.upstreamId || !row.recordKey) return

    try {
      const resolved = await this.resolve({
        capability: row.capability as AiCapability,
        model: row.modelCode,
        input: {},
        options: { timeoutMs: AI_TIMEOUT_DEFAULT_MS },
      })
      const { adapter, ctx } = resolved
      if (!adapter.pollTask) return

      const polled = await adapter.pollTask(
        row.capability as AiCapability,
        row.upstreamId,
        ctx,
      )

      await this.callLogService.updateByRecordKey(row.recordKey, {
        status: polled.status,
        result: buildAiCallLogResult({
          ok: polled.status !== 'failed',
          data: (polled.result as Record<string, unknown> | undefined) ?? null,
          error: polled.error
            ? { code: 'upstream', message: polled.error }
            : null,
          raw: polled.raw,
        }),
        errorCode: polled.error ? 'upstream' : null,
        errorMessage: polled.error ?? null,
        ok: polled.status === 'failed' ? 0 : 1,
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      await this.callLogService.updateByRecordKey(row.recordKey, {
        errorCode: 'poll',
        errorMessage: `轮询上游失败: ${message}`,
      })
    }
  }

  /** 超时未完成异步记录标记 failed */
  async closeStaleTasks(timeoutMs = DEFAULT_TASK_TIMEOUT_MS) {
    const rows = await this.callLogService.listStaleAsync(timeoutMs)
    for (const row of rows) {
      if (!row.recordKey) continue
      await this.callLogService.updateByRecordKey(row.recordKey, {
        status: 'failed',
        errorCode: 'timeout',
        errorMessage: '任务超时关单',
        ok: 0,
      })
    }
  }
}
