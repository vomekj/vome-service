import type {
  AiCallResult,
  AiCapability,
  AiStreamChunk,
} from '../types'

const PATH_CAPABILITY: Array<{ re: RegExp; capability: AiCapability }> = [
  { re: /chat\/completions/i, capability: 'chat' },
  { re: /images\/generations/i, capability: 'image' },
  { re: /embeddings/i, capability: 'embed' },
  { re: /audio\/speech/i, capability: 'audio_tts' },
  { re: /audio\/transcriptions/i, capability: 'audio_stt' },
  { re: /videos/i, capability: 'video' },
]

export function inferCapabilityFromPath(path: string): AiCapability | null {
  for (const { re, capability } of PATH_CAPABILITY) {
    if (re.test(path)) return capability
  }
  return null
}

export function openAiBodyToInput(
  body: Record<string, unknown>,
  capability: AiCapability,
): Record<string, unknown> {
  const { model: _m, stream: _s, ...rest } = body
  if (capability === 'embed' && body.input != null && !body.text) {
    return { ...rest, input: body.input }
  }
  return rest
}

export function toOpenAiChatCompletion(result: Extract<AiCallResult, { kind: 'json' }>) {
  const text = result.data?.text ?? ''
  const msg = result.data?.messages?.[0]
  return {
    id: `chatcmpl_${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: result.model,
    choices: [
      {
        index: 0,
        message: msg ?? { role: 'assistant', content: text },
        finish_reason: 'stop',
      },
    ],
    usage: result.usage
      ? {
          prompt_tokens: result.usage.inputTokens,
          completion_tokens: result.usage.outputTokens,
          total_tokens: result.usage.totalTokens,
        }
      : undefined,
  }
}

export function toOpenAiStreamChunk(chunk: AiStreamChunk, model: string): string {
  if (chunk.type === 'error') {
    return JSON.stringify({
      error: chunk.error ?? { message: 'stream error', type: 'server_error' },
    })
  }
  if (chunk.type === 'done') {
    return '[DONE]'
  }
  const delta = (chunk.data?.delta as Record<string, unknown>) ?? {}
  if (!Object.keys(delta).length && chunk.text) {
    delta.content = chunk.text
  }
  return JSON.stringify({
    id: `chatcmpl_${Date.now()}`,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        delta,
        finish_reason: chunk.data?.finish_reason ?? null,
      },
    ],
  })
}

export function toOpenAiImageResponse(result: Extract<AiCallResult, { kind: 'json' }>) {
  return {
    created: Math.floor(Date.now() / 1000),
    data: (result.data?.assets ?? []).map((a) => ({
      url: a.url ?? null,
      b64_json: a.b64 ?? null,
    })),
  }
}

export function toOpenAiEmbedResponse(result: Extract<AiCallResult, { kind: 'json' }>) {
  return {
    object: 'list',
    data: [{ embedding: result.data?.embedding ?? [], index: 0, object: 'embedding' }],
    usage: result.usage
      ? { total_tokens: result.usage.totalTokens, prompt_tokens: result.usage.inputTokens }
      : undefined,
  }
}

export function minimalTestInput(
  capability: AiCapability,
  code: string,
): Record<string, unknown> {
  switch (capability) {
    case 'chat':
      return { messages: [{ role: 'user', content: `ping ${code}` }] }
    case 'image':
      return { prompt: 'a red circle on white background', size: '1K', ratio: '1:1' }
    case 'embed':
      return { input: 'ping' }
    case 'audio_tts':
      return { input: 'ping' }
    case 'audio_stt':
      return { __probe: true }
    case 'video':
      return { prompt: 'a cat walking', num_frames: 81, frame_rate: 24 }
    default:
      return {}
  }
}
