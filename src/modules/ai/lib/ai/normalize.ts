import type {
  AiAdapterContext,
  AiAsset,
  AiCapability,
  AiChatMessage,
  AiInvokeData,
  AiInvokeResult,
  AiResponseSpec,
  AiResultMode,
  AiUsage,
} from './types'
import { getJsonPath } from './types'

function assistantText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((b) =>
        b && typeof b === 'object' && 'text' in b
          ? String((b as { text?: unknown }).text ?? '')
          : '',
      )
      .join('')
  }
  return ''
}

/** 各 capability 的 OpenAI 兼容默认响应映射 */
export function defaultResponseSpec(
  capability: AiCapability,
): AiResponseSpec | null {
  switch (capability) {
    case 'chat':
      return {
        textPath: 'choices.0.message.content',
        messagesPath: 'choices.0.message',
        toolCallsPath: 'choices.0.message.tool_calls',
        inputTokensPath: 'usage.prompt_tokens',
        outputTokensPath: 'usage.completion_tokens',
        totalTokensPath: 'usage.total_tokens',
      }
    case 'image':
      return {
        assetsPath: 'data',
        assetUrlField: 'url',
        assetB64Field: 'b64_json',
        assetMime: 'image/png',
      }
    case 'embed':
      return {
        embeddingPath: 'data.0.embedding',
        totalTokensPath: 'usage.total_tokens',
      }
    case 'audio_stt':
      return { textPath: 'text' }
    case 'audio_tts':
      return { binary: true, binaryMime: 'audio/mpeg', binaryFileName: 'speech.mp3' }
    default:
      return null
  }
}

function effectiveSpec(
  capability: AiCapability,
  ctx: AiAdapterContext,
): AiResponseSpec | null {
  return ctx.responseSpec ?? defaultResponseSpec(capability)
}

function normalizeUsage(
  raw: Record<string, unknown>,
  spec: AiResponseSpec | null,
): AiUsage | undefined {
  if (!spec) return undefined
  const inputTokens = getJsonPath(raw, spec.inputTokensPath ?? '')
  const outputTokens = getJsonPath(raw, spec.outputTokensPath ?? '')
  const totalTokens = getJsonPath(raw, spec.totalTokensPath ?? '')
  const usage: AiUsage = {}
  if (typeof inputTokens === 'number') usage.inputTokens = inputTokens
  if (typeof outputTokens === 'number') usage.outputTokens = outputTokens
  if (typeof totalTokens === 'number') usage.totalTokens = totalTokens
  return Object.keys(usage).length ? usage : undefined
}

function normalizeAssets(
  raw: Record<string, unknown>,
  spec: AiResponseSpec,
): AiAsset[] {
  const urlField = spec.assetUrlField ?? 'url'
  const b64Field = spec.assetB64Field ?? 'b64_json'
  const mime = spec.assetMime ?? 'application/octet-stream'

  if (spec.assetsPath) {
    const list = getJsonPath(raw, spec.assetsPath)
    if (Array.isArray(list)) {
      return list.map((item) => {
        if (typeof item === 'string') {
          return item.startsWith('http') ? { url: item, mime } : { b64: item, mime }
        }
        if (item && typeof item === 'object') {
          const o = item as Record<string, unknown>
          return {
            url: typeof o[urlField] === 'string' ? o[urlField] : undefined,
            b64: typeof o[b64Field] === 'string' ? o[b64Field] : undefined,
            mime,
          }
        }
        return { mime }
      })
    }
  }

  if (spec.assetUrlPath) {
    const u = getJsonPath(raw, spec.assetUrlPath)
    if (typeof u === 'string' && u) return [{ url: u, mime }]
  }
  if (spec.assetB64Path) {
    const b = getJsonPath(raw, spec.assetB64Path)
    if (typeof b === 'string' && b) return [{ b64: b, mime }]
  }
  if (spec.assetPaths?.length) {
    const out: AiAsset[] = []
    for (const p of spec.assetPaths) {
      const v = getJsonPath(raw, p)
      if (typeof v === 'string' && v) {
        out.push(v.startsWith('http') ? { url: v, mime } : { b64: v, mime })
      }
    }
    if (out.length) return out
  }
  return []
}

function normalizeChatMessages(
  raw: Record<string, unknown>,
  spec: AiResponseSpec,
  text: string,
): AiChatMessage[] {
  const msg = spec.messagesPath
    ? getJsonPath(raw, spec.messagesPath)
    : undefined
  if (msg && typeof msg === 'object' && !Array.isArray(msg)) {
    const m = msg as Record<string, unknown>
    const toolCalls =
      spec.toolCallsPath != null
        ? getJsonPath(raw, spec.toolCallsPath)
        : m.tool_calls
    return [
      {
        role: (m.role as AiChatMessage['role']) || 'assistant',
        content: (m.content as AiChatMessage['content']) ?? text,
        tool_calls: toolCalls,
      },
    ]
  }
  return [{ role: 'assistant', content: text }]
}

/** 将上游 JSON 规范化为统一 data / usage */
export function normalizeSyncData(
  capability: AiCapability,
  ctx: AiAdapterContext,
  raw: Record<string, unknown>,
): { data: AiInvokeData; usage?: AiUsage } {
  const spec = effectiveSpec(capability, ctx)
  const data: AiInvokeData = {}

  if (spec?.textPath) {
    const content = getJsonPath(raw, spec.textPath)
    const text = assistantText(content)
    data.text = text
    if (capability === 'chat') {
      data.messages = normalizeChatMessages(raw, spec, text)
      const toolCalls =
        spec.toolCallsPath != null
          ? getJsonPath(raw, spec.toolCallsPath)
          : undefined
      if (toolCalls != null) data.tool_calls = toolCalls
    }
  } else if (capability === 'chat') {
    const msg = getJsonPath(raw, 'choices.0.message') as
      | Record<string, unknown>
      | undefined
    const text = assistantText(msg?.content)
    data.text = text
    data.messages = [
      {
        role: (msg?.role as AiChatMessage['role']) || 'assistant',
        content: (msg?.content as AiChatMessage['content']) ?? text,
        tool_calls: msg?.tool_calls,
      },
    ]
    if (msg?.tool_calls != null) data.tool_calls = msg.tool_calls
  }

  if (spec?.embeddingPath) {
    const emb = getJsonPath(raw, spec.embeddingPath)
    if (Array.isArray(emb)) data.embedding = emb as number[]
  }

  const assets = spec ? normalizeAssets(raw, spec) : []
  if (assets.length) data.assets = assets

  const usage = normalizeUsage(raw, spec)
  return { data, usage }
}

export function buildSyncResult(
  ok: boolean,
  capability: AiCapability,
  model: string,
  mode: AiResultMode,
  payload: {
    data?: AiInvokeData
    usage?: AiUsage
    error?: { code: string; message: string }
    raw?: unknown
  },
): AiInvokeResult {
  return {
    ok,
    capability,
    model,
    mode,
    data: payload.data,
    usage: payload.usage,
    error: payload.error,
    raw: payload.raw,
  }
}

export function buildBinarySyncData(
  buf: Buffer,
  spec: AiResponseSpec | null,
): AiInvokeData {
  return {
    assets: [
      {
        b64: buf.toString('base64'),
        mime: spec?.binaryMime ?? 'application/octet-stream',
        fileName: spec?.binaryFileName ?? 'output.bin',
      },
    ],
  }
}
