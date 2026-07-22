import { and, eq, isNull } from 'drizzle-orm'
import {
  CommException,
  Inject,
  InjectRepository,
  Provide,
  type Repository,
} from '/#/server'
import { randomBytes } from 'node:crypto'
import { getAiAdapter } from '../lib/ai/adapters'
import type {
  AiCallRequest,
  AiCallResult,
  AiCapability,
  AiInvokeInput,
  AiInvokeResult,
  AiPaths,
  AiProtocolAdapter,
  AiResultMode,
} from '../lib/ai/types'
import {
  AI_TIMEOUT_DEFAULT_MS,
  inferAiMode,
  mergeAbortSignal,
  resolveAiTimeoutMs,
  stripAiDefaultMeta,
} from '../lib/ai/types'
import { aiTask } from '../entity/task'
import { AiModelService } from './model'
import { AiProviderService } from './provider'

function newTaskKey() {
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

  @InjectRepository(aiTask)
  taskRepo: Repository<typeof aiTask>

  /**
   * 统一入口：按模型配置推断 sync / stream / async；
   * 传 taskId 则查询异步进度。
   */
  async call(req: AiCallRequest): Promise<AiCallResult> {
    if (req.taskId) {
      const data = await this.refreshAndGetTask(req.taskId)
      return {
        kind: 'json',
        ok: true,
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

    if (!req.capability) throw new CommException('capability 不能为空')
    if (!req.model) throw new CommException('model 不能为空')

    const resolved = await this.resolve(req)
    const { model, adapter, mode, ctx } = resolved
    const input = (req.input ?? {}) as AiInvokeInput

    if (mode === 'stream') {
      if (!adapter.stream) {
        throw new CommException('当前协议不支持流式')
      }
      return {
        kind: 'stream',
        capability: req.capability,
        model: req.model,
        mode: 'stream',
        stream: adapter.stream(req.capability, input, ctx),
      }
    }

    if (req.capability === 'video' && mode === 'async') {
      const result = await this.createVideoTask(
        req,
        model.id,
        model.code,
        adapter,
        ctx,
      )
      return { kind: 'json', ...result }
    }

    const result = await adapter.invoke(req.capability, mode, input, ctx)
    return {
      kind: 'json',
      ...result,
      model: req.model,
      mode,
    }
  }

  private async resolve(req: AiCallRequest) {
    const model = await this.modelService.findEnabledByCode(req.model)
    if (!model) throw new CommException(`模型不存在或未启用: ${req.model}`)

    const caps = model.capabilities ?? []
    if (!caps.includes(req.capability)) {
      throw new CommException(
        `模型「${req.model}」不支持能力 ${req.capability}`,
      )
    }

    let mode: AiResultMode
    try {
      mode = inferAiMode(req.capability, model.resultModes)
    } catch (e) {
      throw new CommException(e instanceof Error ? e.message : String(e))
    }

    const provider = await this.providerService.getDecrypted(model.providerId)
    if (provider.status !== 1) throw new CommException('AI 连接已停用')
    if (!provider.apiKey) throw new CommException('AI 连接未配置密钥')

    const adapter = getAiAdapter(provider.protocol)
    if (!adapter) {
      throw new CommException(`未实现协议适配器: ${provider.protocol}`)
    }

    const baseUrl =
      (provider.baseUrl && provider.baseUrl.trim()) ||
      'https://api.openai.com'

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
      mode,
      timeoutMs,
      ctx: {
        baseUrl,
        apiKey: provider.apiKey,
        upstreamId: model.upstreamId,
        extra: provider.extra,
        defaults: stripAiDefaultMeta(model.defaults),
        paths: (model.paths as AiPaths | null) ?? null,
        signal,
      },
    }
  }

  private async refreshAndGetTask(taskKey: string) {
    const [row] = await this.taskRepo.find(
      and(eq(aiTask.taskKey, taskKey), isNull(aiTask.deletedAt)),
    )
    if (!row) throw new CommException('任务不存在')

    const terminal = row.status === 'succeeded' || row.status === 'failed'
    if (!terminal && row.upstreamId && row.modelCode) {
      await this.refreshUpstreamTask(row)
      const [fresh] = await this.taskRepo.find(
        and(eq(aiTask.taskKey, taskKey), isNull(aiTask.deletedAt)),
      )
      if (fresh) {
        return {
          taskId: fresh.taskKey,
          status: fresh.status,
          capability: fresh.capability as AiCapability,
          model: fresh.modelCode,
          result: fresh.result,
          error: fresh.error,
          upstreamId: fresh.upstreamId,
        }
      }
    }

    return {
      taskId: row.taskKey,
      status: row.status,
      capability: row.capability as AiCapability,
      model: row.modelCode,
      result: row.result,
      error: row.error,
      upstreamId: row.upstreamId,
    }
  }

  private async createVideoTask(
    req: AiCallRequest,
    modelId: number,
    modelCode: string,
    adapter: AiProtocolAdapter,
    ctx: Awaited<ReturnType<AiGateway['resolve']>>['ctx'],
  ): Promise<AiInvokeResult> {
    const created = await adapter.invoke(
      'video',
      'async',
      (req.input ?? {}) as AiInvokeInput,
      ctx,
    )
    if (!created.ok) {
      return { ...created, model: modelCode, mode: 'async' }
    }

    const upstreamId = String(created.data?.taskId || '')
    if (!upstreamId) {
      throw new CommException('上游未返回视频任务 id')
    }

    const status = String(created.data?.status || 'pending')
    const taskKey = newTaskKey()
    await this.taskRepo.create({
      taskKey,
      modelId,
      modelCode,
      capability: 'video',
      status:
        status === 'succeeded' || status === 'failed' || status === 'running'
          ? status
          : 'pending',
      request: (req.input ?? {}) as Record<string, unknown>,
      result: created.data ?? null,
      error: null,
      upstreamId,
    })

    return {
      ok: true,
      capability: 'video',
      model: modelCode,
      mode: 'async',
      data: {
        taskId: taskKey,
        status: 'pending',
        upstreamId,
        progress: created.data?.progress,
      },
      raw: created.raw,
    }
  }

  private async refreshUpstreamTask(row: typeof aiTask.$inferSelect) {
    if (!row.modelCode || !row.upstreamId) return

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

      await this.taskRepo.update(eq(aiTask.id, row.id), {
        status: polled.status,
        result: (polled.result as Record<string, unknown>) ?? row.result,
        error: polled.error ?? null,
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      await this.taskRepo.update(eq(aiTask.id, row.id), {
        error: `轮询上游失败: ${message}`,
      })
    }
  }
}
