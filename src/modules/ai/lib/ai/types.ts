/** 统一 AI 调用类型（宿主 Gateway） */

export type AiCapability =
  | 'chat'
  | 'image'
  | 'video'
  | 'audio_tts'
  | 'audio_stt'
  | 'embed'

export type AiResultMode = 'sync' | 'stream' | 'async'

/** 请求体 Content-Type 策略 */
export type AiContentType = 'json' | 'multipart'

/**
 * 异步任务契约（模型配置；缺 pollPath 时网关直接报错）
 */
export type AiAsyncSpec = {
  /** 创建响应取上游任务 id 的字段优先级，默认 video_id → task_id → id */
  idFields?: string[]
  /** 轮询路径模板，必填；{id} 替换为上游任务 id */
  pollPath: string
  pollMethod?: string
  /** 成功时结果 URL 的 JSON 路径，如 metadata.url */
  resultUrlPath?: string
  /** 多 URL 路径（与 resultUrlPath 二选一或并用） */
  resultUrlPaths?: string[]
  /** 状态字段名，默认 status */
  statusField?: string
  /** 任务超时关单（ms），默认 3600000 */
  taskTimeoutMs?: number
  /** 异步成功资源 MIME */
  assetMime?: string
}

/** 上游可透传字段提示（仅提示，不参与裁剪/校验） */
export type AiInputFieldHint = {
  key: string
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  required?: boolean
  description?: string
  enum?: string[]
  example?: unknown
  /** 网关覆盖项，前端勿当作可填透传字段 */
  system?: boolean
}

export type AiInputSchema = {
  fields: AiInputFieldHint[]
}

/**
 * 上游响应 → 统一 data 的映射（可选；缺省按 capability 用 OpenAI 兼容默认）
 */
export type AiResponseSpec = {
  textPath?: string
  messagesPath?: string
  toolCallsPath?: string
  assetsPath?: string
  assetUrlField?: string
  assetB64Field?: string
  assetUrlPath?: string
  assetB64Path?: string
  assetMime?: string
  /** 多资源路径，逐项 getJsonPath */
  assetPaths?: string[]
  embeddingPath?: string
  inputTokensPath?: string
  outputTokensPath?: string
  totalTokensPath?: string
  /** 响应体为二进制（如 TTS） */
  binary?: boolean
  binaryMime?: string
  binaryFileName?: string
}

export type AiChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  /** 文本，或多模态 content blocks（含 image_url 等） */
  content: string | Array<Record<string, unknown>>
  tool_calls?: unknown
  tool_call_id?: string
  name?: string
}

export type AiAsset = {
  url?: string
  b64?: string
  mime?: string
  fileName?: string
}

/**
 * 上游请求体（OpenAI 兼容规范字段由调用方按模型文档填写）。
 * 适配器原样透传，不裁剪、不填默认业务字段。
 * 例外：`audioUrl` 为网关拉文件用（stt），不会进入上游 JSON。
 */
export type AiInvokeInput = {
  messages?: AiChatMessage[]
  /** stt：网关拉取后以上游 multipart `file` 上传 */
  audioUrl?: string
  [key: string]: unknown
}

type AiCallOptions = {
  signal?: AbortSignal
  /** 覆盖模型/默认超时 */
  timeoutMs?: number
  /** chat：显式指定 sync/stream（OpenAI 代理用） */
  stream?: boolean
}

/** 统一调用入参（无 mode；由模型配置推断） */
export type AiCallRequest =
  | {
      /** 有则仅查询/刷新异步任务，model 可从记录解析 */
      taskId: string
      model?: string
      capability?: AiCapability
      input?: AiInvokeInput
      options?: AiCallOptions
    }
  | {
      /** ai_model.code */
      model: string
      capability?: AiCapability
      input?: AiInvokeInput
      taskId?: string
      options?: AiCallOptions
    }

export type AiInvokeData = {
  text?: string
  messages?: AiChatMessage[]
  assets?: AiAsset[]
  embedding?: number[]
  taskId?: string
  status?: string
  progress?: number
  [key: string]: unknown
}

export type AiUsage = {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
}

export type AiInvokeResult = {
  ok: boolean
  capability: AiCapability
  model: string
  /** 实际采用的结果形态（只读） */
  mode: AiResultMode
  data?: AiInvokeData
  usage?: AiUsage
  error?: { code: string; message: string }
  raw?: unknown
}

export type AiStreamChunk = {
  type: 'delta' | 'done' | 'error'
  text?: string
  data?: AiInvokeData
  usage?: AiUsage
  error?: { code: string; message: string }
}

export type AiCallJsonResult = AiInvokeResult & {
  kind: 'json'
}

export type AiCallStreamResult = {
  kind: 'stream'
  capability: AiCapability
  model: string
  mode: 'stream'
  stream: AsyncGenerator<AiStreamChunk>
}

export type AiCallResult = AiCallJsonResult | AiCallStreamResult

export type AiAdapterContext = {
  baseUrl: string
  apiKey: string
  /** 上游 model 字段，取自 ai_model.code */
  modelId: string
  /** 请求路径，如 /v1/chat/completions（必填） */
  path: string
  /** HTTP 方法，如 POST */
  method: string
  contentType: AiContentType
  asyncSpec?: AiAsyncSpec | null
  responseSpec?: AiResponseSpec | null
  extra?: Record<string, unknown> | null
  defaults?: Record<string, unknown> | null
  signal?: AbortSignal
}

export type AiPollTaskResult = {
  status: 'pending' | 'running' | 'succeeded' | 'failed'
  progress?: number
  result?: AiInvokeData
  error?: string
  raw?: unknown
}

export type AiProtocolAdapter = {
  protocol: string
  invoke(
    capability: AiCapability,
    mode: AiResultMode,
    input: AiInvokeInput,
    ctx: AiAdapterContext,
  ): Promise<AiInvokeResult>
  stream?(
    capability: AiCapability,
    input: AiInvokeInput,
    ctx: AiAdapterContext,
  ): AsyncGenerator<AiStreamChunk>
  pollTask?(
    capability: AiCapability,
    upstreamId: string,
    ctx: AiAdapterContext,
  ): Promise<AiPollTaskResult>
}

/** 上游超时：sync=120s，async=5s；stream 无默认超时 */
export const AI_TIMEOUT_DEFAULT_MS = 5_000
export const AI_TIMEOUT_SYNC_MS = 120_000

export function inferAiMode(
  capability: AiCapability,
  resultModes: string[] | null | undefined,
): AiResultMode {
  const modes = resultModes?.length ? resultModes : ['sync']
  if (capability === 'video') {
    if (modes.includes('async')) return 'async'
    throw new Error('视频模型需在结果形态中启用 async')
  }
  if (capability === 'chat') {
    if (modes.includes('stream')) return 'stream'
    if (modes.includes('sync')) return 'sync'
    throw new Error('对话模型需在结果形态中启用 stream 或 sync')
  }
  if (modes.includes('sync')) return 'sync'
  if (modes.includes('async')) return 'async'
  throw new Error(`能力 ${capability} 未配置可用的结果形态`)
}

export function resolveAiTimeoutMs(
  mode: AiResultMode,
  timeoutMs?: number,
  modelTimeoutMs?: number,
): number | null {
  if (timeoutMs != null && Number.isFinite(timeoutMs) && timeoutMs > 0) {
    return timeoutMs
  }
  if (
    modelTimeoutMs != null &&
    Number.isFinite(modelTimeoutMs) &&
    modelTimeoutMs > 0
  ) {
    return modelTimeoutMs
  }
  if (mode === 'sync') return AI_TIMEOUT_SYNC_MS
  if (mode === 'stream') return null
  return AI_TIMEOUT_DEFAULT_MS
}

export function mergeAbortSignal(
  timeoutMs: number | null,
  signal?: AbortSignal,
): AbortSignal | undefined {
  if (timeoutMs == null) return signal
  const timed = AbortSignal.timeout(timeoutMs)
  if (!signal) return timed
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any([signal, timed])
  }
  return timed
}

/** defaults 中不透传上游的元字段 */
export function stripAiDefaultMeta(
  defaults?: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!defaults) return null
  const out = { ...defaults }
  delete out.timeoutMs
  delete out.path
  delete out.method
  return out
}

export function normalizeAiContentType(raw: unknown): AiContentType {
  return String(raw ?? 'json').trim().toLowerCase() === 'multipart'
    ? 'multipart'
    : 'json'
}

/** 从对象按 a.b.c 取值 */
export function getJsonPath(obj: unknown, path: string): unknown {
  if (!path.trim()) return undefined
  let cur: unknown = obj
  for (const part of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[part]
  }
  return cur
}

export function pickUpstreamTaskId(
  raw: Record<string, unknown>,
  idFields?: string[] | null,
): string {
  const fields =
    idFields?.length ? idFields : ['video_id', 'task_id', 'id']
  for (const f of fields) {
    const v = raw[f]
    if (v != null && String(v).trim()) return String(v).trim()
  }
  return ''
}

export function requireAsyncSpec(
  asyncSpec: AiAsyncSpec | null | undefined,
): AiAsyncSpec {
  const pollPath = String(asyncSpec?.pollPath ?? '').trim()
  if (!pollPath) {
    throw new Error(
      '异步模型未配置 asyncSpec.pollPath（轮询路径模板，如 /agnesapi?video_id={id}）',
    )
  }
  return {
    ...asyncSpec,
    pollPath: pollPath.startsWith('/') ? pollPath : `/${pollPath}`,
  }
}

export function resolvePollUrl(
  baseUrl: string,
  pollPath: string,
  upstreamId: string,
): string {
  const b = baseUrl.replace(/\/+$/, '')
  const filled = pollPath.replaceAll('{id}', encodeURIComponent(upstreamId))
  if (/^https?:\/\//i.test(filled)) return filled
  const p = filled.startsWith('/') ? filled : `/${filled}`
  return `${b}${p}`
}

export function mapUpstreamTaskStatus(
  raw?: string,
): AiPollTaskResult['status'] {
  const s = String(raw || '').toLowerCase()
  if (
    s === 'completed' ||
    s === 'succeeded' ||
    s === 'success' ||
    s === 'done'
  ) {
    return 'succeeded'
  }
  if (
    s === 'failed' ||
    s === 'error' ||
    s === 'cancelled' ||
    s === 'canceled'
  ) {
    return 'failed'
  }
  if (
    s === 'in_progress' ||
    s === 'running' ||
    s === 'processing' ||
    s === 'generating'
  ) {
    return 'running'
  }
  // queued / pending / …
  return 'pending'
}

const AI_CAPABILITIES: AiCapability[] = [
  'chat',
  'image',
  'video',
  'audio_tts',
  'audio_stt',
  'embed',
]

export function isAiCapability(v: string): v is AiCapability {
  return (AI_CAPABILITIES as string[]).includes(v)
}

/** 单能力模型可省略 capability */
export function resolveAiCapability(
  requested: string | undefined,
  modelCapabilities: string[] | null | undefined,
): AiCapability {
  const caps = (modelCapabilities ?? []).filter(isAiCapability)
  if (requested) {
    if (!isAiCapability(requested)) {
      throw new Error(`无效 capability: ${requested}`)
    }
    if (caps.length && !caps.includes(requested)) {
      throw new Error(`模型不支持能力 ${requested}`)
    }
    return requested
  }
  if (caps.length === 1) return caps[0]!
  throw new Error(
    caps.length
      ? `capability 不能为空（模型含多种能力: ${caps.join(', ')}）`
      : 'capability 不能为空（模型未配置能力）',
  )
}
