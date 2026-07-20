import { RedisClient } from 'bun'
import { Ioc, VomeConfig } from '/#/server'
import type { CacheManagerConfig } from '../../../typings/config/cache'
import { redisConfig } from './config'

/** Redis 缓存 Store（业务与基础设施一律 `@Inject() cache: CacheStore`） */
export class CacheStore {
  constructor(private readonly client: RedisClient) {}

  async get(key: string): Promise<string | null> {
    return this.client.get(key)
  }

  /** 原子读取并删除（一次性凭证核销） */
  async getdel(key: string): Promise<string | null> {
    return this.client.getdel(key)
  }

  async set(key: string, value: string, ttlMs?: number): Promise<void> {
    if (ttlMs != null && ttlMs > 0) {
      await this.client.set(key, value, 'PX', ttlMs)
      return
    }
    await this.client.set(key, value)
  }

  async del(key: string): Promise<void> {
    await this.client.del(key)
  }

  close() {
    this.client.close()
  }
}

/** 仅供 close 释放连接，禁止对外静态读写 */
let store: CacheStore | undefined

async function bootstrap() {
  const cfg = (VomeConfig.cacheManager ?? {}) as CacheManagerConfig
  if (cfg.store !== 'redis') {
    throw new Error(`[Cache] 不支持的 store: ${cfg.store ?? '(未配置)'}`)
  }

  const { url } = redisConfig(cfg)
  const redisClient = new RedisClient(url)
  await redisClient.connect()
  store = new CacheStore(redisClient)
  Ioc.set(CacheStore, store)
}

async function close() {
  store?.close()
  store = undefined
}

/**
 * Redis 缓存生命周期
 *
 * - `Cache.bootstrap()` / `Cache.close()`
 * - 读写：`@Inject() cache: CacheStore`
 */
export const Cache = {
  bootstrap,
  close,
}
