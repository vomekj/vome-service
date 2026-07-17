import type { DbConfig, DbType } from '../../../typings/config/db'

/** drizzle-kit 用：mariadb 走 mysql dialect */
export function drizzleDialect(type: DbType): 'postgresql' | 'mysql' | 'sqlite' {
  return type === 'mariadb' ? 'mysql' : type
}

function assertServerConfig(cfg: DbConfig) {
  const missing = ['host', 'port', 'username', 'password'].filter(
    k => cfg[k as keyof DbConfig] === undefined,
  )
  if (missing.length) {
    throw new Error(`[db] ${cfg.type} 缺少连接参数：${missing.join('、')}`)
  }
}

export function buildDbUrl(cfg: DbConfig): string {
  if (cfg.type === 'sqlite') {
    const file = cfg.database
    if (file.startsWith('sqlite:')) return file
    if (file === ':memory:') return 'sqlite://:memory:'
    return file.startsWith('/') || file.startsWith('./')
      ? `sqlite://${file}`
      : `sqlite://./${file}`
  }

  assertServerConfig(cfg)
  const user = encodeURIComponent(cfg.username!)
  const pass = encodeURIComponent(cfg.password!)
  const proto = cfg.type === 'postgresql' ? 'postgres' : 'mysql'
  return `${proto}://${user}:${pass}@${cfg.host}:${cfg.port}/${cfg.database}`
}

export function serverOptions(cfg: DbConfig) {
  assertServerConfig(cfg)
  return {
    type: cfg.type,
    host: cfg.host!,
    port: cfg.port!,
    username: cfg.username!,
    password: cfg.password!,
    database: cfg.database,
    pool: cfg.pool,
  }
}
