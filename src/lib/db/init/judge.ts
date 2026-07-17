import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SQL } from 'bun'

export type InitKind = 'db' | 'menu'

function lockPath(kind: InitKind, module: string) {
  return join(process.cwd(), 'lock', kind, `${module}.lock`)
}

function confKey(kind: InitKind, module: string) {
  return kind === 'db' ? `initDB:${module}` : `initMenu:${module}`
}

async function hasConfTable(sql: SQL): Promise<boolean> {
  try {
    await sql`SELECT 1 FROM base_conf LIMIT 1`
    return true
  } catch {
    return false
  }
}

async function readConf(sql: SQL, key: string): Promise<string | null> {
  const rows = await sql`
    SELECT "cValue" AS value FROM base_conf
    WHERE "cKey" = ${key}
    LIMIT 1
  `
  const row = rows[0] as { value?: string } | undefined
  return row?.value ?? null
}

async function writeConf(sql: SQL, key: string, value: string) {
  const existing = await readConf(sql, key)
  if (existing === value) return
  if (existing == null) {
    await sql`
      INSERT INTO base_conf ("cKey", "cValue")
      VALUES (${key}, ${value})
    `
    return
  }
  await sql`
    UPDATE base_conf SET "cValue" = ${value}
    WHERE "cKey" = ${key}
  `
}

function readLock(kind: InitKind, module: string): boolean {
  return existsSync(lockPath(kind, module))
}

function writeLock(kind: InitKind, module: string) {
  const file = lockPath(kind, module)
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, new Date().toISOString())
}

/** 模块是否已初始化（initJudge=db 优先查 base_conf，无表则回退 lock） */
export async function isModuleInitialized(
  module: string,
  kind: InitKind,
  judge: string,
  sql?: SQL,
): Promise<boolean> {
  if (judge === 'db' && sql && (await hasConfTable(sql))) {
    return (await readConf(sql, confKey(kind, module))) === '1'
  }
  return readLock(kind, module)
}

/** 标记模块已初始化 */
export async function markModuleInitialized(
  module: string,
  kind: InitKind,
  judge: string,
  sql?: SQL,
) {
  if (judge === 'db' && sql && (await hasConfTable(sql))) {
    await writeConf(sql, confKey(kind, module), '1')
    return
  }
  writeLock(kind, module)
}
