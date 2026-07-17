import { SQL } from 'bun'
import { Database } from 'bun:sqlite'
import mysql from 'mysql2/promise'
import { drizzle as drizzlePg } from 'drizzle-orm/bun-sql'
import { drizzle as drizzleMysql } from 'drizzle-orm/mysql2'
import { drizzle as drizzleSqlite } from 'drizzle-orm/bun-sqlite'
import type { DbConfig } from '../../../typings/config/db'
import { buildDbUrl, serverOptions } from './config'

export type DbClient = SQL | mysql.Pool | Database

let heartbeatTimer: ReturnType<typeof setInterval> | undefined

export function createClient(cfg: DbConfig): DbClient {
  const type = cfg.type

  if (type === 'sqlite') {
    return new Database(cfg.database)
  }

  if (type === 'mysql' || type === 'mariadb') {
    const opts = serverOptions(cfg)
    const heartbeat = (opts.pool?.heartbeatInterval ?? 0) > 0
    return mysql.createPool({
      host: opts.host,
      port: opts.port,
      user: opts.username,
      password: opts.password,
      database: opts.database,
      connectionLimit: opts.pool?.max ?? 10,
      waitForConnections: true,
      // TCP 层保活，减轻远端空闲踢连
      ...(heartbeat ? { enableKeepAlive: true, keepAliveInitialDelay: 0 } : {}),
    })
  }

  const opts = serverOptions(cfg)
  return new SQL({
    url: buildDbUrl(cfg),
    adapter: type === 'postgresql' ? 'postgres' : type,
    max: opts.pool?.max,
    idleTimeout: opts.pool?.idleTimeout,
    maxLifetime: opts.pool?.maxLifetime,
    connectionTimeout: opts.pool?.connectionTimeout,
  })
}

/** 启动应用层心跳；仅 postgresql 走 SELECT 1（mysql 用 enableKeepAlive） */
export function startHeartbeat(client: DbClient, cfg: DbConfig) {
  stopHeartbeat()
  const sec = cfg.pool?.heartbeatInterval ?? 0
  if (sec <= 0 || cfg.type !== 'postgresql') return

  const sql = client as SQL
  heartbeatTimer = setInterval(() => {
    void (async () => {
      try {
        await sql`SELECT 1`
      } catch (err) {
        console.warn('[db] heartbeat failed:', err)
      }
    })()
  }, sec * 1000)
  heartbeatTimer.unref?.()
}

export function stopHeartbeat() {
  if (!heartbeatTimer) return
  clearInterval(heartbeatTimer)
  heartbeatTimer = undefined
}

export function createDrizzle(
  client: DbClient,
  schema: Record<string, unknown>,
  cfg: DbConfig,
) {
  const type = cfg.type
  if (type === 'sqlite') return drizzleSqlite({ client: client as Database, schema })
  if (type === 'mysql' || type === 'mariadb') {
    return drizzleMysql({ client: client as mysql.Pool, schema, mode: 'default' })
  }
  return drizzlePg({ client: client as SQL, schema })
}

export async function closeClient(client: DbClient | undefined, cfg: DbConfig) {
  stopHeartbeat()
  if (!client) return
  const type = cfg.type
  if (type === 'sqlite') {
    (client as Database).close()
    return
  }
  if (type === 'mysql' || type === 'mariadb') {
    await (client as mysql.Pool).end()
    return
  }
  await (client as SQL).close()
}
