import type { RedisCacheOptions } from '../../../typings/config/cache'
import { VomeConfig } from '/#/server'
import type { CacheManagerConfig } from '../../../typings/config/cache'
import { redisConfig } from '../cache/config'
import Redis from 'ioredis'

/** BullMQ 要求 Worker 连接 maxRetriesPerRequest: null */
export type QueueRedisConnection = Redis

let shared: QueueRedisConnection | undefined

/** 从 cacheManager 取同一套 Redis 参数，建 ioredis（队列专用，与 Bun CacheStore 并存） */
export function getQueueRedisOptions(): RedisCacheOptions {
  const cfg = (VomeConfig.cacheManager ?? {}) as CacheManagerConfig
  if (cfg.store !== 'redis' || !cfg.options?.host) {
    throw new Error('[Queue] 需要 cacheManager.store=redis 且配置 host')
  }
  return cfg.options
}

export function createQueueRedis(): QueueRedisConnection {
  const { options } = redisConfig({
    store: 'redis',
    options: getQueueRedisOptions(),
  })
  return new Redis({
    host: options.host,
    port: options.port,
    password: options.password || undefined,
    db: options.db ?? 0,
    family: options.family,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    keepAlive: 10000,
  })
}

/** 全进程共用一条 ioredis；Worker 用 duplicate() */
export function getSharedQueueRedis(): QueueRedisConnection {
  if (!shared) shared = createQueueRedis()
  return shared
}

export async function closeSharedQueueRedis() {
  if (!shared) return
  await shared.quit().catch(() => shared?.disconnect())
  shared = undefined
}
