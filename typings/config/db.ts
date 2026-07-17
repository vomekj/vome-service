import type { Loose } from '../common'

/** 数据库类型 */
export type DbType = 'postgresql' | 'mysql' | 'mariadb' | 'sqlite'

/**
 * 数据库配置（唯一来源；dev/prod 直接用 DbConfig，额外字段靠 Loose 追加）
 */
export type DbConfig = Loose<{
  type: DbType
  /** 库名（网络型）或文件路径（sqlite） */
  database: string
  host?: string
  port?: number
  username?: string
  password?: string
  pool?: Loose<{
    max?: number
    /** 空闲连接关闭秒数（Bun.SQL） */
    idleTimeout?: number
    /** 连接最大存活秒数；0 = 不限制（Bun.SQL） */
    maxLifetime?: number
    /** 新建连接超时秒数 */
    connectionTimeout?: number
    /** 应用层心跳间隔秒数；>0 时定时 SELECT 1 保活（防远端踢空闲连） */
    heartbeatInterval?: number
  }>
  /** 业务实体扫描 glob */
  schema: string
  migrations: string
  push: boolean
}>
