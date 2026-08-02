import { readFile } from 'node:fs/promises'
import {
  and,
  eq,
  getTableColumns,
  getTableName,
  isNull,
  sql,
  type Table,
} from 'drizzle-orm'
import type { createDrizzle } from '../client'
import { buildTableMap } from './table-map'

type Db = ReturnType<typeof createDrizzle> & {
  insert: (table: Table) => {
    values: (row: Record<string, unknown>) => {
      returning: (sel: { id: unknown }) => Promise<Array<{ id: number }>>
    }
  }
  select: (sel: Record<string, unknown>) => {
    from: (t: Table) => {
      where: (cond: unknown) => {
        limit: (n: number) => Promise<Array<Record<string, unknown>>>
      }
    }
  }
}

type Row = Record<string, unknown>

const CHILD_KEY = '@childDatas'
const DICT_TYPE_TABLE = 'base_dict_type'
const DICT_INFO_TABLE = 'base_dict_info'

/**
 * 解析 db.json 占位符：
 * - `@id`：当前父行 id
 * - `@rootId`：根行 id（如 base_dict_type.id，供孙节点 typeId）
 *
 * 不递归 `@childDatas`：孙节点的 `@id` 必须等父行插入后再解析，
 * 否则会把 color 的 parentId 提前解析成字典类型 id，脏成一级节点。
 */
function resolveTokens(
  value: unknown,
  parentId: number | string,
  rootId?: number | string,
): unknown {
  if (value === '@id') return parentId
  if (value === '@rootId') return rootId ?? parentId
  if (Array.isArray(value)) {
    return value.map((item) => resolveTokens(item, parentId, rootId))
  }
  if (value && typeof value === 'object') {
    const out: Row = {}
    for (const [key, val] of Object.entries(value)) {
      if (key === CHILD_KEY) {
        out[key] = val
        continue
      }
      out[key] = resolveTokens(val, parentId, rootId)
    }
    return out
  }
  return value
}

function stripMeta(row: Row) {
  const { [CHILD_KEY]: _child, ...data } = row
  return data
}

function sameDictValue(a: unknown, b: unknown) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

async function insertReturningId(
  db: Db,
  table: Table,
  row: Row,
): Promise<number | string> {
  const cols = getTableColumns(table)
  const idCol = cols.id
  if (!idCol) {
    throw new Error(`[init] 表 ${getTableName(table)} 无 id 列，无法处理 @childDatas`)
  }
  const inserted = await db.insert(table).values(row).returning({ id: idCol })
  const id = inserted[0]?.id
  if (typeof id !== 'number' && typeof id !== 'string') {
    throw new Error(`[init] 插入 ${table} 未返回 id`)
  }
  return id
}

async function findDictTypeId(db: Db, table: Table, key: string): Promise<number | null> {
  const cols = getTableColumns(table)
  if (!cols.id || !cols.key) return null
  const cond =
    cols.deletedAt != null
      ? and(eq(cols.key, key), isNull(cols.deletedAt))
      : eq(cols.key, key)
  const rows = await db.select({ id: cols.id }).from(table).where(cond).limit(1)
  const id = rows[0]?.id
  return typeof id === 'number' ? id : null
}

async function listDictInfoRows(
  db: Db,
  table: Table,
  typeId: number,
): Promise<Array<{ id: number; value: unknown; name: unknown; parentId: unknown }>> {
  const cols = getTableColumns(table)
  if (!cols.typeId || !cols.id) return []
  const cond =
    cols.deletedAt != null
      ? and(eq(cols.typeId, typeId), isNull(cols.deletedAt))
      : eq(cols.typeId, typeId)
  const rows = await db
    .select({
      id: cols.id,
      value: cols.value,
      name: cols.name,
      parentId: cols.parentId,
    })
    .from(table)
    .where(cond)
    .limit(10_000)
  return rows
    .map((r) => ({
      id: r.id as number,
      value: r.value,
      name: r.name,
      parentId: r.parentId,
    }))
    .filter((r) => typeof r.id === 'number')
}

function sameParentId(a: unknown, b: unknown) {
  if (a == null && b == null) return true
  if (a == null || b == null) return false
  return Number(a) === Number(b)
}

/**
 * 递归种字典 info（含 color 等孙节点）。
 * 根项按 value 幂等；同名子项（如 color）按 parentId+name 幂等并回写 value。
 */
async function seedDictInfoChildren(
  db: Db,
  infoTable: Table,
  typeId: number,
  childRows: unknown[],
  tokenParentId: number,
  rootId: number,
  existing: Array<{ id: number; value: unknown; name: unknown; parentId: unknown }>,
) {
  for (const childRow of childRows) {
    if (!childRow || typeof childRow !== 'object' || Array.isArray(childRow)) {
      continue
    }
    const resolved = resolveTokens(childRow, tokenParentId, rootId) as Row
    const nestedDatas = resolved[CHILD_KEY]
    const childData = stripMeta(resolved)
    const parentId =
      childData.parentId === '' || childData.parentId == null
        ? null
        : Number(childData.parentId)

    let infoId: number | null = null
    const name = String(childData.name ?? '')
    if (name === 'color' && parentId != null) {
      const hit = existing.find(
        (e) => sameParentId(e.parentId, parentId) && String(e.name ?? '') === 'color',
      )
      if (hit) infoId = hit.id
    } else {
      const hit = existing.find(
        (e) =>
          sameParentId(e.parentId, parentId) &&
          sameDictValue(e.value, childData.value),
      )
      if (hit) infoId = hit.id
    }

    if (infoId == null) {
      infoId = await insertReturningId(db, infoTable, {
        ...childData,
        parentId,
        typeId: childData.typeId ?? typeId,
      })
      existing.push({
        id: infoId,
        value: childData.value,
        name: childData.name,
        parentId,
      })
    }

    if (
      nestedDatas &&
      typeof nestedDatas === 'object' &&
      !Array.isArray(nestedDatas)
    ) {
      const nestedRows = (nestedDatas as Record<string, unknown>)[DICT_INFO_TABLE]
      if (Array.isArray(nestedRows) && nestedRows.length) {
        await seedDictInfoChildren(
          db,
          infoTable,
          typeId,
          nestedRows,
          infoId,
          rootId,
          existing,
        )
      }
    }
  }
}

/**
 * 字典按 key 增量：类型已存在则跳过类型插入，仅补缺失的 info；
 * 避免共享 base_dict_type 重种撞唯一键。支持 info 下嵌套 color 等孙节点。
 */
async function seedDictTypeRow(
  db: Db,
  tableMap: Map<string, Table>,
  row: Row,
) {
  const typeTable = tableMap.get(DICT_TYPE_TABLE)
  const infoTable = tableMap.get(DICT_INFO_TABLE)
  if (!typeTable || !infoTable) {
    throw new Error(`[init] 缺少 ${DICT_TYPE_TABLE} / ${DICT_INFO_TABLE} schema`)
  }

  const childDatas = row[CHILD_KEY]
  const data = stripMeta(row)
  const key = String(data.key ?? '').trim()
  if (!key) throw new Error('[init] base_dict_type.key 不能为空')

  let typeId = await findDictTypeId(db, typeTable, key)
  if (typeId == null) {
    typeId = await insertReturningId(db, typeTable, data)
    console.log(`[init] dict type ← ${key}`)
  }

  if (!childDatas || typeof childDatas !== 'object' || Array.isArray(childDatas)) {
    return
  }

  const childRows = (childDatas as Record<string, unknown>)[DICT_INFO_TABLE]
  if (!Array.isArray(childRows)) return

  const existing = await listDictInfoRows(db, infoTable, typeId)
  await seedDictInfoChildren(
    db,
    infoTable,
    typeId,
    childRows,
    typeId,
    typeId,
    existing,
  )
}

async function insertRow(
  db: Db,
  tableMap: Map<string, Table>,
  tableName: string,
  row: Row,
  rootId?: number | string,
) {
  if (tableName === DICT_TYPE_TABLE) {
    await seedDictTypeRow(db, tableMap, row)
    return
  }

  const table = tableMap.get(tableName)
  if (!table) throw new Error(`[init] db.json 未知表: ${tableName}`)

  const childDatas = row[CHILD_KEY]
  const data = stripMeta(row)
  const id = await insertReturningId(db, table, data)
  /** 顶层插入某表时，该行即为后续 @rootId */
  const nextRootId = rootId ?? id

  if (!childDatas || typeof childDatas !== 'object' || Array.isArray(childDatas)) {
    return
  }

  for (const [childTable, childRows] of Object.entries(
    childDatas as Record<string, unknown>,
  )) {
    if (!Array.isArray(childRows)) continue
    for (const childRow of childRows) {
      if (!childRow || typeof childRow !== 'object' || Array.isArray(childRow)) {
        continue
      }
      const resolved = resolveTokens(childRow, id, nextRootId) as Row
      await insertRow(db, tableMap, childTable, resolved, nextRootId)
    }
  }
}

async function tableIsEmpty(db: Db, table: Table) {
  // Db 与自定义 insert 交叉后，drizzle 多方言 select 推断失效；收窄为可执行查询
  const client = db as unknown as {
    select: (sel: { count: ReturnType<typeof sql> }) => {
      from: (t: Table) => Promise<Array<{ count: number | null }>>
    }
  }
  const rows = await client
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(table)
  return (rows[0]?.count ?? 0) === 0
}

/** user_info 是否已有同 phone / email（避免重复种默认账号） */
async function userInfoExists(
  db: Db,
  table: Table,
  data: Row,
): Promise<boolean> {
  const cols = getTableColumns(table)
  const client = db as unknown as {
    select: (sel: { id: unknown }) => {
      from: (t: Table) => {
        where: (cond: unknown) => {
          limit: (n: number) => Promise<Array<{ id: unknown }>>
        }
      }
    }
  }
  if (data.phone != null && cols.phone) {
    const rows = await client
      .select({ id: cols.id })
      .from(table)
      .where(eq(cols.phone, data.phone))
      .limit(1)
    if (rows.length) return true
  }
  if (data.email != null && cols.email) {
    const rows = await client
      .select({ id: cols.id })
      .from(table)
      .where(eq(cols.email, data.email))
      .limit(1)
    if (rows.length) return true
  }
  return false
}

/** 模块已初始化后：空表全量补种；字典表按 key 增量补缺失项 */
export async function seedEmptyTablesFromModuleDb(
  file: string,
  db: ReturnType<typeof createDrizzle>,
  schema: Record<string, unknown>,
) {
  const raw = await readFile(file, 'utf8')
  const payload = JSON.parse(raw) as Record<string, unknown>
  const tableMap = buildTableMap(schema)

  for (const [tableName, rows] of Object.entries(payload)) {
    if (!Array.isArray(rows) || !rows.length) continue
    const table = tableMap.get(tableName)
    if (!table) continue

    if (tableName === DICT_TYPE_TABLE) {
      for (const row of rows) {
        if (!row || typeof row !== 'object' || Array.isArray(row)) continue
        await seedDictTypeRow(db as Db, tableMap, row as Row)
      }
      console.log(`[init] db seed ← ${tableName} (incremental)`)
      continue
    }

    /** user_info：按 phone/email 幂等补种（agent 本地上传默认账号） */
    if (tableName === 'user_info') {
      let added = 0
      for (const row of rows) {
        if (!row || typeof row !== 'object' || Array.isArray(row)) continue
        const data = stripMeta(row as Row)
        if (await userInfoExists(db as Db, table, data)) continue
        await insertRow(db as Db, tableMap, tableName, row as Row)
        added++
      }
      if (added) console.log(`[init] db seed ← ${tableName} (+${added})`)
      continue
    }

    if (!(await tableIsEmpty(db as Db, table))) continue

    for (const row of rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) continue
      await insertRow(db as Db, tableMap, tableName, row as Row)
    }
    console.log(`[init] db seed ← ${tableName}`)
  }
}

/** 导入单个模块 db.json（字典按 key 幂等） */
export async function importModuleDb(
  file: string,
  db: ReturnType<typeof createDrizzle>,
  schema: Record<string, unknown>,
) {
  const raw = await readFile(file, 'utf8')
  const payload = JSON.parse(raw) as Record<string, unknown>
  const tableMap = buildTableMap(schema)

  for (const [tableName, rows] of Object.entries(payload)) {
    if (!Array.isArray(rows)) {
      console.warn(`[init] 跳过 ${tableName}：值必须是数组`)
      continue
    }
    for (const row of rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) continue
      await insertRow(db as Db, tableMap, tableName, row as Row)
    }
  }
}
