import type { Loose } from '../common'
import type { CrudUpsertMode } from '/#/server'
import type { AuthConfig } from './auth'
import type { CacheManagerConfig } from './cache'
import type { SocketIOConfig } from './socket'

export type { AuthConfig } from './auth'
export type { CacheManagerConfig, RedisCacheOptions } from './cache'
export type { DbConfig, DbType } from './db'
export type { SocketIOConfig } from './socket'

/**
 * default.ts 一级配置
 *
 * 子块尽量引用已有类型 + Loose，避免把同一结构再抄一遍。
 */
export interface DefaultConfig {
  keys: string

  system: Loose<{
    port: number
    /**
     * 宿主 C 端语言包 origin（scopeKey → 基址）
     * GET {origin}/locales/zh-CN.json；是否同步由 vome.eps 控制
     */
    localeOrigins?: Loose<{
      web?: string
      uniapp?: string
      [scopeKey: string]: string | undefined
    }>
  }>

  openapi: Loose<{
    enable: boolean
    path?: string
    documentation?: Loose<Record<string, unknown>>
    /** Scalar UI 配置（如 defaultOpenAllTags） */
    scalar?: Loose<Record<string, unknown>>
  }>

  asyncContextManager: Loose<{
    enable: boolean
  }>

  /** 复用 CacheManagerConfig，勿再手写 store/options */
  cacheManager: Loose<CacheManagerConfig>

  vome: Loose<{
    /** 多租户开关；true 开启数据隔离与按域名绑定前端用户 */
    tenant?: boolean
    crud?: Loose<{
      upsert?: CrudUpsertMode
      softDelete?: boolean
    }>
  }>

  auth?: Loose<AuthConfig>

  /** Socket.IO */
  socketIO?: Loose<SocketIOConfig>

  [key: string]: any
}
