import type { CacheManagerConfig, RedisCacheOptions } from '../../../typings/config/cache'

export function buildRedisUrl(options: RedisCacheOptions): string {
  const auth = options.password
    ? `:${encodeURIComponent(options.password)}@`
    : ''
  const db = options.db ?? 0
  return `redis://${auth}${options.host}:${options.port}/${db}`
}

export function redisConfig(cfg: CacheManagerConfig) {
  return {
    url: buildRedisUrl(cfg.options),
    options: cfg.options,
  }
}
