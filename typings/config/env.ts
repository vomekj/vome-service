import type { Loose } from '../common'
import type { DbConfig } from './db'

export type { DbConfig, DbType } from './db'

/**
 * dev.ts / prod.ts 环境层（与 DefaultConfig 合并）
 *
 * db 直接用 DbConfig（本身已是 Loose），不要再复制一套连接字段。
 */
export interface EnvConfig {
  db: DbConfig

  logging: Loose<{
    level: string
    transport: 'console' | 'file'
    dir?: string
    maxDays?: number
  }>

  vome: Loose<{
    eps: boolean
    initDB: boolean
    initJudge: string
    initMenu: boolean
  }>

  [key: string]: any
}
