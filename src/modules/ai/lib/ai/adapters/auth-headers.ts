import type { AiAdapterContext } from '../types'

export type AuthStyle = 'openai' | 'anthropic' | 'gemini'

export function buildUpstreamHeaders(
  ctx: AiAdapterContext,
  style: AuthStyle,
  extra: Record<string, string> = {},
): Record<string, string> {
  const base: Record<string, string> = { ...extra }
  const providerExtra = (ctx.extra ?? {}) as Record<string, unknown>
  const custom = providerExtra.headers
  if (custom && typeof custom === 'object' && !Array.isArray(custom)) {
    for (const [k, v] of Object.entries(custom as Record<string, unknown>)) {
      if (v != null) base[k] = String(v)
    }
  }

  switch (style) {
    case 'anthropic':
      return {
        ...base,
        'x-api-key': ctx.apiKey,
        'anthropic-version':
          String(providerExtra.anthropicVersion ?? '2023-06-01'),
        'Content-Type': 'application/json',
      }
    case 'gemini': {
      const h = { ...base, 'Content-Type': 'application/json' }
      if (providerExtra.apiKeyHeader === 'query') return h
      return { ...h, 'x-goog-api-key': ctx.apiKey }
    }
    default:
      return {
        ...base,
        Authorization: `Bearer ${ctx.apiKey}`,
        'Content-Type': 'application/json',
      }
  }
}

export function appendGeminiQueryKey(url: string, ctx: AiAdapterContext) {
  const providerExtra = (ctx.extra ?? {}) as Record<string, unknown>
  if (providerExtra.apiKeyHeader !== 'query') return url
  const u = new URL(url)
  u.searchParams.set('key', ctx.apiKey)
  return u.toString()
}
