import { Inject, Provide } from '/#/server'
import { CacheStore } from '../cache'
import { AuthExpires } from './config'

const WEB_ACCESS_PREFIX = 'web:access:'
const ADMIN_ACCESS_PREFIX = 'admin:access:'

/**
 * Opaque token 与 Redis access token 白名单（可注入）
 *
 * - `create()` / `hash()` — opaque refresh
 * - `web.*` / `admin.*` — access JWT 存取
 */
@Provide()
export class TokenService {
  @Inject()
  cache: CacheStore

  create() {
    return `${crypto.randomUUID()}${crypto.randomUUID().replace(/-/g, '')}`
  }

  hash(token: string) {
    return new Bun.CryptoHasher('sha256').update(token).digest('hex')
  }

  private webAccessKey(token: string) {
    return `${WEB_ACCESS_PREFIX}${this.hash(token)}`
  }

  private adminAccessKey(token: string) {
    return `${ADMIN_ACCESS_PREFIX}${this.hash(token)}`
  }

  readonly web = {
    store: async (token: string, payload: Record<string, unknown>) => {
      await this.cache.set(
        this.webAccessKey(token),
        JSON.stringify(payload),
        AuthExpires.access.ms(),
      )
    },
    has: async (token: string) => {
      return !!(await this.cache.get(this.webAccessKey(token)))
    },
    revoke: async (token: string) => {
      await this.cache.del(this.webAccessKey(token))
    },
  }

  readonly admin = {
    store: async (token: string, payload: Record<string, unknown>) => {
      await this.cache.set(
        this.adminAccessKey(token),
        JSON.stringify(payload),
        AuthExpires.access.ms(),
      )
    },
    has: async (token: string) => {
      return !!(await this.cache.get(this.adminAccessKey(token)))
    },
    revoke: async (token: string) => {
      await this.cache.del(this.adminAccessKey(token))
    },
  }
}
