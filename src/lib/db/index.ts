import { SQL } from 'bun'
import { DbStore, Ioc, VomeConfig, syncColumnCommentsToPg } from '/#/server'
import type { DbConfig } from '../../../typings/config/db'
import { buildSchemaIndex } from './schema/build'
import {
  closeClient,
  createClient,
  createDrizzle,
  startHeartbeat,
  type DbClient,
} from './client'
import { buildDbUrl, drizzleDialect } from './config'
import { pushSchemaIfNeeded } from './push'
import { initModules } from './init'

const dbConfig = VomeConfig.db as DbConfig

/** 仅供 close 释放连接 */
let store: DbStore | undefined

async function bootstrap() {
  const moduleCount = await buildSchemaIndex()
  // import schema 会执行各实体 columnComments()，填满注册表
  const schema = await import('./schema')
  await pushSchemaIfNeeded(moduleCount, dbConfig, schema)
  const client = createClient(dbConfig)
  if (dbConfig.type === 'postgresql') {
    const n = await syncColumnCommentsToPg(client as SQL)
    if (n > 0) console.log(`[db] column comments synced: ${n}`)
  }
  startHeartbeat(client, dbConfig)
  const drizzle = createDrizzle(client, schema, dbConfig)
  const sql = dbConfig.type === 'postgresql' ? (client as SQL) : undefined
  await initModules({ db: drizzle, schema, sql })
  store = new DbStore(drizzle, client, schema, sql)
  Ioc.set(DbStore, store)
}

async function close() {
  if (!store) return
  await closeClient(store.client as DbClient, dbConfig)
  store = undefined
}

/**
 * 数据库生命周期
 *
 * - `Db.bootstrap()` / `Db.close()`
 * - 访问：`@Inject() db: DbStore` 或 `Ioc.get(DbStore)`（DbStore 来自 vome-core）
 */
export const Db = {
  bootstrap,
  close,
}

export { DbStore, buildDbUrl, drizzleDialect }
