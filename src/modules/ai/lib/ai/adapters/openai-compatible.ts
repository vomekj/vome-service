import { CommException } from '/#/server'
import type {
  AiAdapterContext,
  AiCapability,
  AiInvokeInput,
  AiInvokeResult,
  AiPollTaskResult,
  AiProtocolAdapter,
  AiResultMode,
  AiStreamChunk,
} from '../types'
import {
  getJsonPath,
  mapUpstreamTaskStatus,
  pickUpstreamTaskId,
  requireAsyncSpec,
  resolvePollUrl,
} from '../types'
import {
  buildBinarySyncData,
  buildSyncResult,
  defaultResponseSpec,
  normalizeSyncData,
} from '../normalize'
import {
  mergeInput,
  postUpstream,
  postUpstreamJson,
  postUpstreamMultipart,
  readUpstreamError,
  toUpstreamJson,
  appendFormFields,
} from '../transport'

async function syncInvoke(
  capability: AiCapability,
  input: AiInvokeInput,
  ctx: AiAdapterContext,
  override: Record<string, unknown> = {},
): Promise<AiInvokeResult> {
  const body = mergeInput(input, ctx.defaults)
  const spec = ctx.responseSpec ?? defaultResponseSpec(capability)

  if (spec?.binary || capability === 'audio_tts') {
    const res = await postUpstream(ctx, body, override)
    if (!res.ok) {
      return buildSyncResult(false, capability, ctx.modelId, 'sync', {
        error: { code: 'upstream', message: await readUpstreamError(res) },
      })
    }
    const buf = Buffer.from(await res.arrayBuffer())
    return buildSyncResult(true, capability, ctx.modelId, 'sync', {
      data: buildBinarySyncData(buf, spec),
    })
  }

  if (capability === 'audio_stt') {
    const audioUrl = String(body.audioUrl ?? '')
    const fileInput = body.file
    const probe = body.__probe === true
    let blob: Blob | null = null
    if (fileInput != null) {
      if (typeof fileInput === 'string') {
        if (fileInput.startsWith('data:')) {
          const res = await fetch(fileInput)
          blob = await res.blob()
        } else {
          const buf = Buffer.from(fileInput, 'base64')
          blob = new Blob([buf])
        }
      } else if (fileInput instanceof Blob) {
        blob = fileInput
      }
    }
    if (!blob) {
      if (!audioUrl && !probe) {
        throw new CommException('audio_stt 需要 file（base64/data-uri）或 audioUrl')
      }
      if (audioUrl) {
        const fileRes = await fetch(audioUrl, { signal: ctx.signal })
        if (!fileRes.ok) {
          throw new CommException(`拉取音频失败: ${fileRes.status}`)
        }
        blob = await fileRes.blob()
      }
    }
    const form = new FormData()
    const uploadName =
      String(body.fileName ?? '').trim() || 'audio.webm'
    if (blob) form.append('file', blob, uploadName)
    form.append('model', ctx.modelId)
    appendFormFields(form, body, new Set(['model', 'file', 'fileName']))
    const res = await postUpstreamMultipart(ctx, form)
    if (!res.ok) {
      return buildSyncResult(false, capability, ctx.modelId, 'sync', {
        error: { code: 'upstream', message: await readUpstreamError(res) },
      })
    }
    const json = (await res.json()) as Record<string, unknown>
    const { data, usage } = normalizeSyncData(capability, ctx, json)
    return buildSyncResult(true, capability, ctx.modelId, 'sync', {
      data,
      usage,
      raw: json,
    })
  }

  if (capability === 'chat') {
    const messages = body.messages
    if (!Array.isArray(messages) || !messages.length) {
      throw new CommException('chat 需要 messages')
    }
  }

  const res = await postUpstream(ctx, body, override)
  if (!res.ok) {
    return buildSyncResult(false, capability, ctx.modelId, 'sync', {
      error: { code: 'upstream', message: await readUpstreamError(res) },
    })
  }

  const json = (await res.json()) as Record<string, unknown>
  const { data, usage } = normalizeSyncData(capability, ctx, json)
  return buildSyncResult(true, capability, ctx.modelId, 'sync', {
    data,
    usage,
    raw: json,
  })
}

async function* chatStream(
  input: AiInvokeInput,
  ctx: AiAdapterContext,
): AsyncGenerator<AiStreamChunk> {
  const body = mergeInput(input, ctx.defaults)
  const messages = body.messages
  if (!Array.isArray(messages) || !messages.length) {
    throw new CommException('chat 需要 messages')
  }

  const res = await postUpstreamJson(
    ctx,
    toUpstreamJson(ctx, body, { stream: true }),
  )
  if (!res.ok) {
    yield {
      type: 'error',
      error: { code: 'upstream', message: await readUpstreamError(res) },
    }
    return
  }
  const reader = res.body?.getReader()
  if (!reader) {
    yield { type: 'error', error: { code: 'stream', message: '无响应流' } }
    return
  }
  const decoder = new TextDecoder()
  let buf = ''
  let full = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      const s = line.trim()
      if (!s.startsWith('data:')) continue
      const data = s.slice(5).trim()
      if (data === '[DONE]') {
        yield { type: 'done', text: full, data: { text: full } }
        return
      }
      try {
        const j = JSON.parse(data) as {
          choices?: Array<{
            delta?: Record<string, unknown>
            finish_reason?: string | null
          }>
          usage?: Record<string, unknown>
        }
        const choice = j.choices?.[0]
        const delta = choice?.delta ?? {}
        const piece = typeof delta.content === 'string' ? delta.content : ''
        if (piece) full += piece
        if (Object.keys(delta).length || choice?.finish_reason != null) {
          yield {
            type: 'delta',
            text: piece || undefined,
            data: {
              delta,
              finish_reason: choice?.finish_reason ?? undefined,
            },
            usage: j.usage
              ? {
                  inputTokens: j.usage.prompt_tokens as number | undefined,
                  outputTokens: j.usage.completion_tokens as number | undefined,
                  totalTokens: j.usage.total_tokens as number | undefined,
                }
              : undefined,
          }
        }
      } catch {
        // skip bad chunk
      }
    }
  }
  yield { type: 'done', text: full, data: { text: full } }
}

async function asyncCreate(
  capability: AiCapability,
  input: AiInvokeInput,
  ctx: AiAdapterContext,
): Promise<AiInvokeResult> {
  let spec
  try {
    spec = requireAsyncSpec(ctx.asyncSpec)
  } catch (e) {
    throw new CommException(e instanceof Error ? e.message : String(e))
  }
  const body = mergeInput(input, ctx.defaults)
  const res = await postUpstream(ctx, body)
  if (!res.ok) {
    return buildSyncResult(false, capability, ctx.modelId, 'async', {
      error: { code: 'upstream', message: await readUpstreamError(res) },
    })
  }
  const json = (await res.json()) as Record<string, unknown>
  const upstreamId = pickUpstreamTaskId(json, spec.idFields)
  if (!upstreamId) {
    return buildSyncResult(false, capability, ctx.modelId, 'async', {
      error: {
        code: 'upstream',
        message: '上游未返回任务 id（请检查 asyncSpec.idFields）',
      },
      raw: json,
    })
  }
  const statusField = spec.statusField || 'status'
  const status = mapUpstreamTaskStatus(String(json[statusField] ?? ''))
  return buildSyncResult(true, capability, ctx.modelId, 'async', {
    data: {
      taskId: upstreamId,
      status,
      progress: typeof json.progress === 'number' ? json.progress : undefined,
    },
    raw: json,
  })
}

async function asyncPoll(
  upstreamId: string,
  ctx: AiAdapterContext,
): Promise<AiPollTaskResult> {
  let spec
  try {
    spec = requireAsyncSpec(ctx.asyncSpec)
  } catch (e) {
    throw new CommException(e instanceof Error ? e.message : String(e))
  }
  const url = resolvePollUrl(ctx.baseUrl, spec.pollPath, upstreamId)
  const method = String(spec.pollMethod ?? 'GET').trim().toUpperCase() || 'GET'
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${ctx.apiKey}` },
    signal: ctx.signal,
  })
  if (!res.ok) {
    return { status: 'failed', error: await readUpstreamError(res) }
  }
  const json = (await res.json()) as Record<string, unknown>
  const statusField = spec.statusField || 'status'
  const status = mapUpstreamTaskStatus(String(json[statusField] ?? ''))
  const progress =
    typeof json.progress === 'number' ? json.progress : undefined

  if (status === 'failed') {
    const errRaw = json.error
    const err =
      typeof errRaw === 'string'
        ? errRaw
        : errRaw && typeof errRaw === 'object' && 'message' in errRaw
          ? String((errRaw as { message?: unknown }).message || '任务失败')
          : '任务失败'
    return { status, progress, error: err, raw: json }
  }

  if (status === 'succeeded') {
    const mime = spec.assetMime ?? 'video/mp4'
    const assets: NonNullable<AiPollTaskResult['result']>['assets'] = []
    const urlPaths = [
      ...(spec.resultUrlPaths ?? []),
      ...(spec.resultUrlPath ? [spec.resultUrlPath] : []),
    ]
    for (const p of urlPaths) {
      const u = getJsonPath(json, p)
      if (typeof u === 'string' && u) {
        assets.push({ url: u, mime, fileName: `${upstreamId}.mp4` })
      }
    }
    return {
      status,
      progress: progress ?? 100,
      result: {
        taskId: upstreamId,
        status,
        ...(assets.length ? { assets } : {}),
      },
      raw: json,
    }
  }

  return {
    status,
    progress,
    result: { taskId: upstreamId, status },
    raw: json,
  }
}

/** OpenAI 兼容协议（HTTP 透传 + 可配置/默认响应规范化） */
export const openaiCompatibleAdapter: AiProtocolAdapter = {
  protocol: 'openai_compatible',

  async invoke(capability, mode, input, ctx) {
    if (mode === 'async') return asyncCreate(capability, input, ctx)
    if (mode === 'stream') {
      throw new CommException('流式请通过 AiGateway.call（模型启用 stream）')
    }
    if (capability === 'chat') {
      return syncInvoke(capability, input, ctx, { stream: false })
    }
    return syncInvoke(capability, input, ctx)
  },

  async *stream(capability, input, ctx) {
    if (capability !== 'chat') {
      throw new CommException('仅 chat 支持流式')
    }
    yield* chatStream(input, ctx)
  },

  async pollTask(_capability, upstreamId, ctx) {
    return asyncPoll(upstreamId, ctx)
  },
}

export function assertModeSupported(
  capability: AiCapability,
  mode: AiResultMode,
) {
  if (capability === 'chat' && (mode === 'sync' || mode === 'stream')) return
  if (mode === 'async') return
  if (
    (capability === 'image' ||
      capability === 'audio_tts' ||
      capability === 'audio_stt' ||
      capability === 'embed' ||
      capability === 'video') &&
    mode === 'sync'
  ) {
    return
  }
  throw new CommException(`能力 ${capability} 不支持模式 ${mode}`)
}
