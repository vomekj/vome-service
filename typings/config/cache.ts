import type { Loose } from '../common'

/** Redis 连接参数（可 Loose 追加 family 以外的驱动字段） */
export type RedisCacheOptions = Loose<{
  host: string
  port: number
  password?: string
  db?: number
  family?: number
}>

/** cacheManager 配置（default 里复用，勿再手写一套 store/options） */
export type CacheManagerConfig = Loose<{
  store: string
  options: RedisCacheOptions
}>
