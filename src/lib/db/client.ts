import { SQL } from 'bun'
import { Database } from 'bun:sqlite'
import mysql from 'mysql2/promise'
import { drizzle as drizzlePg } from 'drizzle-orm/bun-sql'
import { drizzle as drizzleMysql } from 'drizzle-orm/mysql2'
import { drizzle as drizzleSqlite } from 'drizzle-orm/bun-sqlite'
import type { DbConfig } from '../../../typings/config/db'
import { buildDbUrl, serverOptions } from './config'

export type DbClient = SQL | mysql.Pool | Database

/** 含首次：连接类错误最多再换连重试 1 次 */
const DB_CONN_RETRY_MAX = 2

let heartbeatTimer: ReturnType<typeof setInterval> | undefined

function errorText(err: unknown): string {
  const parts: string[] = []
  let cur: unknown = err
  for (let i = 0; i < 5 && cur != null; i++) {
    if (cur instanceof Error) {
      parts.push(cur.message)
      cur = cur.cause
      continue
    }
    parts.push(String(cur))
    break
  }
  return parts.join(' ').toLowerCase()
}

/** 连接失效 / 池掐断等可换连重试的错误 */
export function isTransientDbConnError(err: unknown): boolean {
  const s = errorText(err)
  return (
    s.includes('max lifetime') ||
    s.includes('idle timeout') ||
    s.includes('econnreset') ||
    s.includes('econnrefused') ||
    s.includes('etimedout') ||
    s.includes('not connected') ||
    s.includes('connection closed') ||
    s.includes('connection terminated') ||
    s.includes('server closed the connection') ||
    s.includes('broken pipe') ||
    s.includes('socket hang up') ||
    s.includes('connect e') ||
    /\bconnection\b.*\b(reset|refused|lost|closed|ended|terminated)\b/.test(s)
  )
}

async function reconnectSql(sql: SQL): Promise<void> {
  await sql.connect()
}

/**
 * 包一层：drizzle 走 client.unsafe；连接失效时 reconnect 后再试 1 次。
 * 事务内 reserved 连接不经此 Proxy 的 unsafe，不会误重试半截事务。
 */
function wrapSqlWithConnRetry(sql: SQL): SQL {
  const runWithRetry = async <T>(
    exec: () => PromiseLike<T> | T,
  ): Promise<T> => {
    let last: unknown
    for (let attempt = 1; attempt <= DB_CONN_RETRY_MAX; attempt++) {
      try {
        return await exec()
      } catch (err) {
        last = err
        if (!isTransientDbConnError(err) || attempt >= DB_CONN_RETRY_MAX) {
          throw err
        }
        console.warn(
          `[db] conn error, retry ${attempt}/${DB_CONN_RETRY_MAX}:`,
          err instanceof Error ? err.message : err,
        )
        try {
          await reconnectSql(sql)
        } catch (reErr) {
          console.warn('[db] reconnect failed:', reErr)
        }
      }
    }
    throw last
  }

  const wrapUnsafe = (...args: Parameters<SQL['unsafe']>) => {
    const invoke = () => (sql.unsafe as Function).apply(sql, args) as ReturnType<
      SQL['unsafe']
    >

    const thenable = {
      then(onFulfilled?: unknown, onRejected?: unknown) {
        return runWithRetry(() => invoke()).then(
          onFulfilled as (v: unknown) => unknown,
          onRejected as (e: unknown) => unknown,
        )
      },
      values() {
        return {
          then(onFulfilled?: unknown, onRejected?: unknown) {
            return runWithRetry(() => {
              const r = invoke() as { values: () => PromiseLike<unknown> }
              return r.values()
            }).then(
              onFulfilled as (v: unknown) => unknown,
              onRejected as (e: unknown) => unknown,
            )
          },
        }
      },
    }
    return thenable as ReturnType<SQL['unsafe']>
  }

  return new Proxy(sql, {
    get(target, prop, receiver) {
      if (prop === 'unsafe') return wrapUnsafe
      const val = Reflect.get(target, prop, receiver)
      return typeof val === 'function' ? val.bind(target) : val
    },
  }) as SQL
}

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
  const sql = new SQL({
    url: buildDbUrl(cfg),
    adapter: type === 'postgresql' ? 'postgres' : type,
    max: opts.pool?.max,
    idleTimeout: opts.pool?.idleTimeout,
    maxLifetime: opts.pool?.maxLifetime,
    connectionTimeout: opts.pool?.connectionTimeout,
  })
  return wrapSqlWithConnRetry(sql)
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
        try {
          await reconnectSql(sql)
          await sql`SELECT 1`
          console.info('[db] reconnect ok')
        } catch (err2) {
          console.warn('[db] reconnect failed:', err2)
        }
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
    ;(client as Database).close()
    return
  }
  if (type === 'mysql' || type === 'mariadb') {
    await (client as mysql.Pool).end()
    return
  }
  await (client as SQL).close()
}
