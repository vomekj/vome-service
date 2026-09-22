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
    /** 应用层心跳间隔秒数；>0 时定时 SELECT 1。只打到池里一条连接，不能代替 TCP keepAlive */
    heartbeatInterval?: number
    /**
     * TCP keepAlive。false 时 MySQL / PostgreSQL 都不开。SQLite 无 TCP，不使用。
     * MySQL：enableKeepAlive，延迟用毫秒。
     * PostgreSQL：建连会话参数 tcp_keepalives_idle / tcp_keepalives_interval / tcp_keepalives_count。
     * 不要用 libpq 的 keepalives、keepalives_idle、keepalives_interval、keepalives_count（Bun 会当成 SET，服务端不认并 FATAL）。
     */
    keepAlive?: boolean
    /** 空闲多少秒后发 TCP 保活。PostgreSQL 用秒；MySQL 换成毫秒。默认 10，最小 1 */
    keepAliveInitialDelay?: number
  }>
  /** 业务实体扫描 glob */
  schema: string
  migrations: string
  push: boolean
}>
