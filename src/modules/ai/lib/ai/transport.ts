import { CommException } from '/#/server'
import type { AiAdapterContext, AiInvokeInput } from './types'

/** 网关内部字段，不进入上游请求体 */
export const INTERNAL_BODY_KEYS = new Set([
  'timeoutMs',
  'path',
  'method',
  'audioUrl',
  'file',
  '__probe',
])

export function joinUrl(base: string, path: string) {
  const b = base.replace(/\/+$/, '')
  const p = path.startsWith('/') ? path : `/${path}`
  return `${b}${p}`
}

export function requirePath(ctx: AiAdapterContext) {
  const path = String(ctx.path ?? '').trim()
  if (!path) throw new CommException('模型未配置请求路径')
  return path
}

export function httpMethod(ctx: AiAdapterContext) {
  const m = String(ctx.method ?? 'POST').trim().toUpperCase()
  return m || 'POST'
}

export function resolvePath(ctx: AiAdapterContext) {
  return joinUrl(ctx.baseUrl, requirePath(ctx))
}

export async function readUpstreamError(res: Response): Promise<string> {
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

export function mergeInput(
  input: AiInvokeInput,
  defaults?: Record<string, unknown> | null,
): Record<string, unknown> {
  const base = { ...(defaults ?? {}) }
  delete base.timeoutMs
  delete base.path
  delete base.method
  return { ...base, ...input }
}

/** input/defaults 原样透传；覆盖 model 与 override（如 stream） */
export function toUpstreamJson(
  ctx: AiAdapterContext,
  body: Record<string, unknown>,
  override: Record<string, unknown> = {},
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(body)) {
    if (v === undefined) continue
    if (INTERNAL_BODY_KEYS.has(k)) continue
    out[k] = v
  }
  out.model = ctx.modelId
  for (const [k, v] of Object.entries(override)) {
    if (v !== undefined) out[k] = v
  }
  return out
}

export function appendFormFields(
  form: FormData,
  body: Record<string, unknown>,
  skip: Set<string>,
) {
  for (const [k, v] of Object.entries(body)) {
    if (v === undefined || v === null) continue
    if (INTERNAL_BODY_KEYS.has(k) || skip.has(k)) continue
    if (typeof v === 'object') {
      form.append(k, JSON.stringify(v))
      continue
    }
    form.append(k, String(v))
  }
}

function upstreamHeaders(
  ctx: AiAdapterContext,
  extra: Record<string, string> = {},
): Record<string, string> {
  const custom = ctx.extra?.headers
  const fromExtra =
    custom && typeof custom === 'object' && !Array.isArray(custom)
      ? Object.fromEntries(
          Object.entries(custom as Record<string, unknown>).map(([k, v]) => [
            k,
            String(v),
          ]),
        )
      : {}
  return {
    Authorization: `Bearer ${ctx.apiKey}`,
    'Content-Type': 'application/json',
    ...fromExtra,
    ...extra,
  }
}

export async function postUpstreamJson(
  ctx: AiAdapterContext,
  payload: Record<string, unknown>,
  headerExtra: Record<string, string> = {},
) {
  return fetch(resolvePath(ctx), {
    method: httpMethod(ctx),
    headers: upstreamHeaders(ctx, headerExtra),
    body: JSON.stringify(payload),
    signal: ctx.signal,
  })
}

export async function postUpstreamMultipart(
  ctx: AiAdapterContext,
  form: FormData,
  headerExtra: Record<string, string> = {},
) {
  const h = upstreamHeaders(ctx, headerExtra)
  delete h['Content-Type']
  return fetch(resolvePath(ctx), {
    method: httpMethod(ctx),
    headers: h,
    body: form,
    signal: ctx.signal,
  })
}

/** 按 contentType 发主请求（json 或 multipart+model） */
export async function postUpstream(
  ctx: AiAdapterContext,
  body: Record<string, unknown>,
  override: Record<string, unknown> = {},
) {
  if (ctx.contentType === 'multipart') {
    const form = new FormData()
    form.append('model', ctx.modelId)
    appendFormFields(form, body, new Set(['model']))
    for (const [k, v] of Object.entries(override)) {
      if (v === undefined || v === null) continue
      form.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v))
    }
    return postUpstreamMultipart(ctx, form)
  }
  return postUpstreamJson(ctx, toUpstreamJson(ctx, body, override))
}
