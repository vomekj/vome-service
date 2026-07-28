import { Inject, Provide } from '/#/server'
import { CacheStore } from '../cache'
import { AuthExpires } from './config'

const WEB_ACCESS_PREFIX = 'web:access:'
const ADMIN_ACCESS_PREFIX = 'admin:access:'
const AGENT_ACCESS_PREFIX = 'agent:access:'

/**
 * Opaque token 与 Redis access token 白名单（可注入）
 *
 * - `create()` / `hash()` — opaque refresh
 * - `web.*` / `admin.*` / `agent.*` — access JWT 存取
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

  private agentAccessKey(token: string) {
    return `${AGENT_ACCESS_PREFIX}${this.hash(token)}`
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

  readonly agent = {
    store: async (token: string, payload: Record<string, unknown>) => {
      await this.cache.set(
        this.agentAccessKey(token),
        JSON.stringify(payload),
        AuthExpires.access.ms(),
      )
    },
    get: async (token: string): Promise<Record<string, unknown> | null> => {
      const raw = await this.cache.get(this.agentAccessKey(token))
      if (!raw) return null
      try {
        return JSON.parse(raw) as Record<string, unknown>
      } catch {
        return null
      }
    },
    has: async (token: string) => {
      return !!(await this.cache.get(this.agentAccessKey(token)))
    },
    touch: async (token: string) => {
      const payload = await this.agent.get(token)
      if (!payload) return false
      await this.agent.store(token, payload)
      return true
    },
    revoke: async (token: string) => {
      await this.cache.del(this.agentAccessKey(token))
    },
  }
}
