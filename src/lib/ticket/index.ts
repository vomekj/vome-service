import { randomUUID } from 'node:crypto'
import { CommException, Inject, Provide } from '/#/server'
import { CacheStore } from '../cache'

const DEFAULT_TTL_MS = 10 * 60 * 1000
const KEY_PREFIX = 'otp:'

export type IssueTicketOptions<T> = {
  /** 业务命名空间，如 `plugin-dl` */
  namespace: string
  payload: T
  /** 默认 10 分钟 */
  ttlMs?: number
  /** 有则拼相对 URL：`{path}?token=` */
  path?: string
}

export type IssueTicketResult = {
  token: string
  expireAt: number
  expiresIn: number
  /** 仅当 issue 传入 path 时有值 */
  url?: string
}

/**
 * 通用一次性 Token（Redis GETDEL 原子核销）
 *
 * 任意业务：`@Inject() ticket: OneTimeTicketService`，自备 namespace + payload。
 */
@Provide()
export class OneTimeTicketService {
  @Inject()
  cache: CacheStore

  private key(namespace: string, token: string) {
    const ns = String(namespace || '')
      .trim()
      .replace(/[^a-zA-Z0-9:_-]/g, '')
    if (!ns) throw new CommException('ticket namespace 无效')
    return `${KEY_PREFIX}${ns}:${token}`
  }

  async issue<T>(opts: IssueTicketOptions<T>): Promise<IssueTicketResult> {
    const ttlMs =
      opts.ttlMs != null && opts.ttlMs > 0 ? opts.ttlMs : DEFAULT_TTL_MS
    const token = randomUUID().replace(/-/g, '')
    await this.cache.set(
      this.key(opts.namespace, token),
      JSON.stringify(opts.payload ?? null),
      ttlMs,
    )
    const expiresIn = Math.floor(ttlMs / 1000)
    const result: IssueTicketResult = {
      token,
      expireAt: Date.now() + ttlMs,
      expiresIn,
    }
    const rawPath = String(opts.path || '').trim()
    if (rawPath) {
      const path = rawPath.startsWith('/') ? rawPath : `/${rawPath}`
      result.url = `${path}?token=${encodeURIComponent(token)}`
    }
    return result
  }

  async redeem<T>(namespace: string, token: string): Promise<T> {
    const rawToken = String(token || '').trim()
    if (!rawToken) throw new CommException('链接无效或已使用')

    const raw = await this.cache.getdel(this.key(namespace, rawToken))
    if (!raw) throw new CommException('链接无效或已使用')

    try {
      return JSON.parse(raw) as T
    } catch {
      throw new CommException('链接无效或已使用')
    }
  }
}
