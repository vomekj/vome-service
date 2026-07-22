import { CommException } from '/#/server'
import type {
  AiAdapterContext,
  AiCapability,
  AiInvokeInput,
  AiInvokeResult,
  AiPathKey,
  AiPollTaskResult,
  AiProtocolAdapter,
  AiResultMode,
  AiStreamChunk,
} from '../types'

const DEFAULT_PATHS: Record<AiPathKey, string> = {
  chat: '/v1/chat/completions',
  image: '/v1/images/generations',
  audio_tts: '/v1/audio/speech',
  audio_stt: '/v1/audio/transcriptions',
  embed: '/v1/embeddings',
  video: '/v1/videos',
  videoGet: '/v1/videos/{id}',
  videoContent: '/v1/videos/{id}/content',
}

function joinUrl(base: string, path: string) {
  const b = base.replace(/\/+$/, '')
  const p = path.startsWith('/') ? path : `/${path}`
  return `${b}${p}`
}

function resolvePath(ctx: AiAdapterContext, key: AiPathKey, id?: string) {
  const custom = ctx.paths?.[key]
  let path = (typeof custom === 'string' && custom.trim()) || DEFAULT_PATHS[key]
  if (id) path = path.replaceAll('{id}', encodeURIComponent(id))
  return joinUrl(ctx.baseUrl, path)
}

async function readError(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as {
      error?: { message?: string }
      message?: string
    }
    return j.error?.message || j.message || res.statusText
  } catch {
    return res.statusText || `HTTP ${res.status}`
  }
}

function mergeInput(
  input: AiInvokeInput,
  defaults?: Record<string, unknown> | null,
): Record<string, unknown> {
  const base = { ...(defaults ?? {}) }
  delete base.timeoutMs
  delete base.paths
  return { ...base, ...input }
}

async function chatSync(
  input: AiInvokeInput,
  ctx: AiAdapterContext,
): Promise<AiInvokeResult> {
  const body = mergeInput(input, ctx.defaults)
  const messages = (body.messages as AiInvokeInput['messages']) ?? []
  if (!messages.length) throw new CommException('chat 需要 messages')

  const res = await fetch(resolvePath(ctx, 'chat'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ctx.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: ctx.upstreamId,
      messages,
      stream: false,
      temperature: body.temperature,
      max_tokens: body.max_tokens ?? body.maxTokens,
    }),
    signal: ctx.signal,
  })
  if (!res.ok) {
    return {
      ok: false,
      capability: 'chat',
      model: ctx.upstreamId,
      mode: 'sync',
      error: { code: 'upstream', message: await readError(res) },
    }
  }
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string; role?: string } }>
    usage?: {
      prompt_tokens?: number
      completion_tokens?: number
      total_tokens?: number
    }
  }
  const text = json.choices?.[0]?.message?.content ?? ''
  return {
    ok: true,
    capability: 'chat',
    model: ctx.upstreamId,
    mode: 'sync',
    data: { text, messages: [{ role: 'assistant', content: text }] },
    usage: {
      inputTokens: json.usage?.prompt_tokens,
      outputTokens: json.usage?.completion_tokens,
      totalTokens: json.usage?.total_tokens,
    },
    raw: json,
  }
}

async function* chatStream(
  input: AiInvokeInput,
  ctx: AiAdapterContext,
): AsyncGenerator<AiStreamChunk> {
  const body = mergeInput(input, ctx.defaults)
  const messages = (body.messages as AiInvokeInput['messages']) ?? []
  if (!messages.length) throw new CommException('chat 需要 messages')

  const res = await fetch(resolvePath(ctx, 'chat'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ctx.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: ctx.upstreamId,
      messages,
      stream: true,
      temperature: body.temperature,
      max_tokens: body.max_tokens ?? body.maxTokens,
    }),
    signal: ctx.signal,
  })
  if (!res.ok) {
    yield {
      type: 'error',
      error: { code: 'upstream', message: await readError(res) },
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
      const payload = s.slice(5).trim()
      if (payload === '[DONE]') {
        yield { type: 'done', text: full, data: { text: full } }
        return
      }
      try {
        const j = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string } }>
        }
        const delta = j.choices?.[0]?.delta?.content ?? ''
        if (delta) {
          full += delta
          yield { type: 'delta', text: delta }
        }
      } catch {
        // skip bad chunk
      }
    }
  }
  yield { type: 'done', text: full, data: { text: full } }
}

async function imageSync(
  input: AiInvokeInput,
  ctx: AiAdapterContext,
): Promise<AiInvokeResult> {
  const body = mergeInput(input, ctx.defaults)
  const prompt = String(body.prompt ?? body.text ?? '')
  if (!prompt) throw new CommException('image 需要 prompt')

  const res = await fetch(resolvePath(ctx, 'image'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ctx.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: ctx.upstreamId,
      prompt,
      n: body.n ?? 1,
      size: body.size ?? '1024x1024',
      response_format: body.response_format ?? 'url',
    }),
    signal: ctx.signal,
  })
  if (!res.ok) {
    return {
      ok: false,
      capability: 'image',
      model: ctx.upstreamId,
      mode: 'sync',
      error: { code: 'upstream', message: await readError(res) },
    }
  }
  const json = (await res.json()) as {
    data?: Array<{ url?: string; b64_json?: string }>
  }
  const assets = (json.data ?? []).map((d) => ({
    url: d.url,
    b64: d.b64_json,
    mime: 'image/png',
  }))
  return {
    ok: true,
    capability: 'image',
    model: ctx.upstreamId,
    mode: 'sync',
    data: { assets },
    raw: json,
  }
}

async function audioTts(
  input: AiInvokeInput,
  ctx: AiAdapterContext,
): Promise<AiInvokeResult> {
  const body = mergeInput(input, ctx.defaults)
  const text = String(body.text ?? body.prompt ?? '')
  if (!text) throw new CommException('audio_tts 需要 text')

  const res = await fetch(resolvePath(ctx, 'audio_tts'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ctx.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: ctx.upstreamId,
      input: text,
      voice: body.voice ?? 'alloy',
      response_format: body.format ?? body.response_format ?? 'mp3',
    }),
    signal: ctx.signal,
  })
  if (!res.ok) {
    return {
      ok: false,
      capability: 'audio_tts',
      model: ctx.upstreamId,
      mode: 'sync',
      error: { code: 'upstream', message: await readError(res) },
    }
  }
  const buf = Buffer.from(await res.arrayBuffer())
  return {
    ok: true,
    capability: 'audio_tts',
    model: ctx.upstreamId,
    mode: 'sync',
    data: {
      assets: [
        {
          b64: buf.toString('base64'),
          mime: 'audio/mpeg',
          fileName: 'speech.mp3',
        },
      ],
    },
  }
}

async function audioStt(
  input: AiInvokeInput,
  ctx: AiAdapterContext,
): Promise<AiInvokeResult> {
  const body = mergeInput(input, ctx.defaults)
  const audioUrl = String(body.audioUrl ?? '')
  if (!audioUrl) throw new CommException('audio_stt 需要 audioUrl')

  const fileRes = await fetch(audioUrl, { signal: ctx.signal })
  if (!fileRes.ok) throw new CommException(`拉取音频失败: ${fileRes.status}`)
  const blob = await fileRes.blob()
  const form = new FormData()
  form.append('file', blob, 'audio.webm')
  form.append('model', ctx.upstreamId)
  if (body.language) form.append('language', String(body.language))

  const res = await fetch(resolvePath(ctx, 'audio_stt'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${ctx.apiKey}` },
    body: form,
    signal: ctx.signal,
  })
  if (!res.ok) {
    return {
      ok: false,
      capability: 'audio_stt',
      model: ctx.upstreamId,
      mode: 'sync',
      error: { code: 'upstream', message: await readError(res) },
    }
  }
  const json = (await res.json()) as { text?: string }
  return {
    ok: true,
    capability: 'audio_stt',
    model: ctx.upstreamId,
    mode: 'sync',
    data: { text: json.text ?? '' },
    raw: json,
  }
}

async function embedSync(
  input: AiInvokeInput,
  ctx: AiAdapterContext,
): Promise<AiInvokeResult> {
  const body = mergeInput(input, ctx.defaults)
  const text = String(body.text ?? body.prompt ?? '')
  if (!text) throw new CommException('embed 需要 text')

  const res = await fetch(resolvePath(ctx, 'embed'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ctx.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: ctx.upstreamId,
      input: text,
    }),
    signal: ctx.signal,
  })
  if (!res.ok) {
    return {
      ok: false,
      capability: 'embed',
      model: ctx.upstreamId,
      mode: 'sync',
      error: { code: 'upstream', message: await readError(res) },
    }
  }
  const json = (await res.json()) as {
    data?: Array<{ embedding?: number[] }>
    usage?: { total_tokens?: number }
  }
  return {
    ok: true,
    capability: 'embed',
    model: ctx.upstreamId,
    mode: 'sync',
    data: { embedding: json.data?.[0]?.embedding ?? [] },
    usage: { totalTokens: json.usage?.total_tokens },
    raw: json,
  }
}

function mapVideoStatus(raw?: string): AiPollTaskResult['status'] {
  const s = String(raw || '').toLowerCase()
  if (s === 'completed' || s === 'succeeded' || s === 'success') return 'succeeded'
  if (s === 'failed' || s === 'error' || s === 'cancelled' || s === 'canceled') {
    return 'failed'
  }
  if (s === 'in_progress' || s === 'running' || s === 'processing') return 'running'
  return 'pending'
}

/** OpenAI Videos：创建异步任务 */
async function videoCreate(
  input: AiInvokeInput,
  ctx: AiAdapterContext,
): Promise<AiInvokeResult> {
  const body = mergeInput(input, ctx.defaults)
  const prompt = String(body.prompt ?? body.text ?? '')
  if (!prompt) throw new CommException('video 需要 prompt')

  const form = new FormData()
  form.append('model', ctx.upstreamId)
  form.append('prompt', prompt)
  if (body.size != null) form.append('size', String(body.size))
  if (body.seconds != null) form.append('seconds', String(body.seconds))
  if (body.input_reference != null) {
    form.append('input_reference', String(body.input_reference))
  }

  const res = await fetch(resolvePath(ctx, 'video'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${ctx.apiKey}` },
    body: form,
    signal: ctx.signal,
  })
  if (!res.ok) {
    return {
      ok: false,
      capability: 'video',
      model: ctx.upstreamId,
      mode: 'async',
      error: { code: 'upstream', message: await readError(res) },
    }
  }
  const json = (await res.json()) as {
    id?: string
    status?: string
    progress?: number
    error?: { message?: string }
  }
  const upstreamId = String(json.id || '')
  if (!upstreamId) {
    return {
      ok: false,
      capability: 'video',
      model: ctx.upstreamId,
      mode: 'async',
      error: { code: 'upstream', message: '上游未返回 video id' },
      raw: json,
    }
  }
  const status = mapVideoStatus(json.status)
  return {
    ok: true,
    capability: 'video',
    model: ctx.upstreamId,
    mode: 'async',
    data: {
      taskId: upstreamId,
      status,
      progress: json.progress,
    },
    raw: json,
  }
}

async function videoPoll(
  upstreamId: string,
  ctx: AiAdapterContext,
): Promise<AiPollTaskResult> {
  const res = await fetch(resolvePath(ctx, 'videoGet', upstreamId), {
    method: 'GET',
    headers: { Authorization: `Bearer ${ctx.apiKey}` },
    signal: ctx.signal,
  })
  if (!res.ok) {
    return {
      status: 'failed',
      error: await readError(res),
    }
  }
  const json = (await res.json()) as {
    id?: string
    status?: string
    progress?: number
    error?: { message?: string } | string
  }
  const status = mapVideoStatus(json.status)
  if (status === 'failed') {
    const err =
      typeof json.error === 'string'
        ? json.error
        : json.error?.message || 'video 生成失败'
    return { status, progress: json.progress, error: err, raw: json }
  }
  if (status === 'succeeded') {
    const contentUrl = resolvePath(ctx, 'videoContent', upstreamId)
    return {
      status,
      progress: json.progress ?? 100,
      result: {
        taskId: upstreamId,
        status,
        assets: [{ url: contentUrl, mime: 'video/mp4', fileName: `${upstreamId}.mp4` }],
      },
      raw: json,
    }
  }
  return {
    status,
    progress: json.progress,
    result: { taskId: upstreamId, status },
    raw: json,
  }
}

/** OpenAI 兼容协议（多数中转 / 自建网关） */
export const openaiCompatibleAdapter: AiProtocolAdapter = {
  protocol: 'openai_compatible',

  async invoke(capability, mode, input, ctx) {
    if (capability === 'video') {
      if (mode !== 'async') {
        throw new CommException('video 请使用 mode=async')
      }
      return videoCreate(input, ctx)
    }
    if (mode === 'async') {
      throw new CommException('openai_compatible 当前仅 video 支持 async')
    }
    if (mode === 'stream') {
      throw new CommException('流式请通过 AiGateway.call（模型启用 stream）')
    }
    switch (capability) {
      case 'chat':
        return chatSync(input, ctx)
      case 'image':
        return imageSync(input, ctx)
      case 'audio_tts':
        return audioTts(input, ctx)
      case 'audio_stt':
        return audioStt(input, ctx)
      case 'embed':
        return embedSync(input, ctx)
      default:
        throw new CommException(`不支持的能力: ${capability}`)
    }
  },

  async *stream(capability, input, ctx) {
    if (capability !== 'chat') {
      throw new CommException('仅 chat 支持流式')
    }
    yield* chatStream(input, ctx)
  },

  async pollTask(capability, upstreamId, ctx) {
    if (capability !== 'video') {
      throw new CommException(`pollTask 不支持能力: ${capability}`)
    }
    return videoPoll(upstreamId, ctx)
  },
}

export function assertModeSupported(
  capability: AiCapability,
  mode: AiResultMode,
) {
  if (capability === 'chat' && (mode === 'sync' || mode === 'stream')) return
  if (
    (capability === 'image' ||
      capability === 'audio_tts' ||
      capability === 'audio_stt' ||
      capability === 'embed') &&
    mode === 'sync'
  ) {
    return
  }
  if (capability === 'video' && mode === 'async') return
  throw new CommException(`能力 ${capability} 不支持模式 ${mode}`)
}
