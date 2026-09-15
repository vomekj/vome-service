import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SQL } from 'bun'

export type InitKind = 'db' | 'menu'

function lockDir(kind: InitKind) {
  return join(process.cwd(), 'lock', kind)
}

function lockPath(kind: InitKind, module: string) {
  return join(lockDir(kind), `${module}.lock`)
}

/** initDB:activity → modules/activity/db.json；initMenu:activity → modules/activity/menu.json */
function confKey(kind: InitKind, module: string) {
  return kind === 'db' ? `initDB:${module}` : `initMenu:${module}`
}

function confPrefix(kind: InitKind) {
  return kind === 'db' ? 'initDB:' : 'initMenu:'
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

function listLockModules(kind: InitKind): Set<string> {
  const dir = lockDir(kind)
  if (!existsSync(dir)) return new Set()
  const out = new Set<string>()
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.lock')) continue
    out.add(name.slice(0, -'.lock'.length))
  }
  return out
}

/**
 * 一次拉齐已 init 模块名（内存 Set）。
 * - initJudge=db：一条 SQL 读 base_conf 的 initDB:* / initMenu:*
 * - lock：扫 lock/{db|menu}/*.lock
 * 之后按模块名判断即可，不必再读 db.json / menu.json 内容。
 */
export async function loadInitFlagSet(
  kind: InitKind,
  judge: string,
  sql?: SQL,
): Promise<Set<string>> {
  if (judge === 'db' && sql && (await hasConfTable(sql))) {
    const prefix = confPrefix(kind)
    const like = `${prefix}%`
    const rows = await sql`
      SELECT "cKey" AS key FROM base_conf
      WHERE "cKey" LIKE ${like} AND "cValue" = '1'
    `
    const out = new Set<string>()
    for (const row of rows as Array<{ key?: string }>) {
      const key = String(row.key || '')
      if (!key.startsWith(prefix)) continue
      const mod = key.slice(prefix.length)
      if (mod) out.add(mod)
    }
    return out
  }
  return listLockModules(kind)
}

/** 单模块查询（兼容旧调用；批量场景请用 loadInitFlagSet） */
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

/** 标记模块已初始化（initDB:activity / initMenu:activity） */
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
