/** 统一 AI 调用类型（宿主 Gateway） */

export type AiCapability =
  | 'chat'
  | 'image'
  | 'video'
  | 'audio_tts'
  | 'audio_stt'
  | 'embed'

export type AiResultMode = 'sync' | 'stream' | 'async'

/** 可覆盖的上游路径键；未配则用 OpenAI 默认 */
export type AiPathKey =
  | 'chat'
  | 'image'
  | 'audio_tts'
  | 'audio_stt'
  | 'embed'
  | 'video'
  | 'videoGet'
  | 'videoContent'

export type AiPaths = Partial<Record<AiPathKey, string>>

export type AiChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
}

export type AiAsset = {
  url?: string
  b64?: string
  mime?: string
  fileName?: string
}

export type AiInvokeInput = {
  /** chat */
  messages?: AiChatMessage[]
  /** image / video / tts 主文案 */
  prompt?: string
  text?: string
  /** stt */
  audioUrl?: string
  /** 能力扩展，透传上游 */
  [key: string]: unknown
}

/** 统一调用入参（无 mode；由模型配置推断） */
export type AiCallRequest = {
  /** ai_model.code */
  model: string
  capability: AiCapability
  input?: AiInvokeInput
  /** 有则查询异步任务进度 */
  taskId?: string
  options?: {
    signal?: AbortSignal
    /** 覆盖模型/默认超时 */
    timeoutMs?: number
  }
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
  upstreamId: string
  extra?: Record<string, unknown> | null
  defaults?: Record<string, unknown> | null
  /** 模型级路径覆盖 */
  paths?: AiPaths | null
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
  delete out.paths
  return out
}
