import { Elysia } from 'elysia'
import { Context, Ioc, isPublicHttpRoute } from '/#/server'
import { extractBizCode, resolveLogType } from '../../typings/base/log-scope'
import { LogService } from '../modules/base/service/log'

const ADMIN_PREFIX = '/admin'
const APP_PREFIX = '/app'

/** 完整序列化，不截断（File/Blob 只记元信息） */
function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, (_k, v) => {
      if (typeof File !== 'undefined' && v instanceof File) {
        return `[File name=${v.name} size=${v.size}]`
      }
      if (typeof Blob !== 'undefined' && v instanceof Blob) {
        return `[Blob size=${v.size} type=${v.type}]`
      }
      if (typeof v === 'bigint') return v.toString()
      return v
    })
  } catch {
    return String(value)
  }
}

function serializeResponse(response: unknown): string {
  if (response == null) return ''
  if (typeof response === 'string') return response
  if (response instanceof Response) {
    return `[Response status=${response.status}]`
  }
  return safeJson(response)
}

function resolveSide(path: string): 'admin' | 'app' | null {
  if (path === ADMIN_PREFIX || path.startsWith(`${ADMIN_PREFIX}/`)) return 'admin'
  if (path === APP_PREFIX || path.startsWith(`${APP_PREFIX}/`)) return 'app'
  return null
}

function resolveHttpStatus(
  set: { status?: number | string },
  response: unknown,
): number {
  // Elysia status(401) → { code, response }
  if (response && typeof response === 'object' && response !== null) {
    const r = response as Record<string, unknown>
    if (
      typeof r.code === 'number' &&
      r.code >= 100 &&
      r.code < 600 &&
      'response' in r
    ) {
      return r.code
    }
  }
  const statusRaw = set.status
  if (typeof statusRaw === 'number') return statusRaw
  if (typeof statusRaw === 'string' && /^\d+$/.test(statusRaw)) return Number(statusRaw)
  return 200
}

type RequestServer = {
  requestIP?: (request: Request) => { address?: string } | null
} | null

/** 代理头优先，否则 Bun socket IP；本机/内网地址也照常记录，不丢弃 */
function resolveRequestIp(
  request: Request,
  server: RequestServer,
  fallback?: unknown,
): string {
  if (typeof fallback === 'string' && fallback.trim()) return fallback.trim()

  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  const fromHeader =
    request.headers.get('x-real-ip')?.trim() ||
    request.headers.get('cf-connecting-ip')?.trim() ||
    ''
  if (fromHeader) return fromHeader

  const sock = server?.requestIP?.(request)?.address?.trim()
  return sock || ''
}

function scheduleRecord(payload: {
  response: unknown
  body: unknown
  query: unknown
  request: Request
  set: { status?: number | string }
  server: RequestServer
  unhandledError?: boolean
}) {
  const store = Context.get()
  if (!store || store._requestLogged) return

  const url = new URL(payload.request.url)
  const side = resolveSide(url.pathname)
  if (!side) return

  const status = resolveHttpStatus(payload.set, payload.response)
  const bizCode = extractBizCode(payload.response)
  const matchInput = {
    method: payload.request.method,
    path: url.pathname,
    status,
    bizCode,
    isPublic: isPublicHttpRoute(payload.request.method, url.pathname),
    unhandledError: Boolean(payload.unhandledError),
  }
  const logService = Ioc.get(LogService)
  if (!logService.shouldRecord(matchInput)) {
    return
  }

  Context({ _requestLogged: true })

  const adminId = store.adminId
  const userId = store.userId
  const actor =
    adminId != null && adminId !== ''
      ? String(adminId)
      : userId != null && userId !== ''
        ? String(userId)
        : null

  const duration = Math.max(0, Date.now() - Number(store.startTime ?? Date.now()))
  const ip = resolveRequestIp(payload.request, payload.server, store.ip)
  if (ip) Context({ ip })

  try {
    logService.record({
      userId: actor,
      side,
      ip: ip || null,
      method: payload.request.method,
      action: url.pathname,
      logType: resolveLogType(matchInput),
      params: safeJson({ query: payload.query ?? {}, body: payload.body ?? null }),
      response: serializeResponse(payload.response),
      duration,
      status,
    })
  } catch (err) {
    console.error('[RequestLog] enqueue failed', err)
  }
}

/**
 * 全量请求监控：/admin、/app 下所有请求（含未登录）
 * 入队后批量入库（满 50 或最多 5s），不 await，避免拖慢响应
 */
export const requestLog = new Elysia({ name: 'request-log' })
  .onAfterHandle({ as: 'global' }, ({ request, body, query, response, set, server }) => {
    scheduleRecord({
      request,
      body,
      query,
      response,
      set,
      server: server as RequestServer,
    })
  })
  .onError({ as: 'global' }, ({ request, body, query, error, set, server }) => {
    const message =
      error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : error
    scheduleRecord({
      request,
      body,
      query,
      response: message,
      set: { status: typeof set.status === 'number' ? set.status : 500 },
      server: server as RequestServer,
      unhandledError: true,
    })
  })
  .as('global')
