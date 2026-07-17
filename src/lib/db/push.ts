import type { DbConfig } from '../../../typings/config/db'
import { closeClient, createClient, createDrizzle } from './client'

type DrizzleExec = { execute: (query: unknown) => Promise<unknown> }

/**
 * drizzle-kit push 期望 execute() 返回 { rows: [] }
 * bun-sql 驱动直接返回数组，需适配否则 introspect 失败并 process.exit(1)
 */
function drizzleForKitPush(drizzleDb: DrizzleExec): DrizzleExec {
  return {
    execute: async (query) => {
      const res = await drizzleDb.execute(query)
      return Array.isArray(res) ? { rows: res } : res
    },
  }
}

/** drizzle-kit 失败时直接 process.exit，拦截后抛出可读错误 */
async function runKitPush<T>(fn: () => Promise<T>): Promise<T> {
  const exit = process.exit
  process.exit = ((code?: number) => {
    throw new Error(`[db] schema push failed (exit ${code ?? 0})`)
  }) as typeof process.exit
  try {
    return await fn()
  } finally {
    process.exit = exit
  }
}

/** 仅 dev + push:true 时动态加载 drizzle-kit，避免打进生产 bundle */
async function loadKitPush() {
  return import('drizzle-kit/api')
}

export async function pushSchemaIfNeeded(
  moduleCount: number,
  cfg: DbConfig,
  schemaMod: Record<string, unknown>,
) {
  if (!cfg.push || moduleCount === 0) return

  const { pushSchema, pushMySQLSchema, pushSQLiteSchema } = await loadKitPush()

  const client = createClient(cfg)
  try {
    const drizzleDb = createDrizzle(client, schemaMod, cfg)
    const type = cfg.type

    const result = await runKitPush(() => {
      if (type === 'sqlite') {
        return pushSQLiteSchema(schemaMod, drizzleDb as never)
      }
      if (type === 'mysql' || type === 'mariadb') {
        return pushMySQLSchema(schemaMod, drizzleDb as never, cfg.database)
      }
      return pushSchema(schemaMod, drizzleForKitPush(drizzleDb as DrizzleExec) as never)
    })

    if (result.warnings.length) console.warn('[db] push warnings:', result.warnings)
    await result.apply()
    console.log('[db] schema pushed')
  } finally {
    await closeClient(client, cfg)
  }
}
