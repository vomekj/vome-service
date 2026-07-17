import { readFile } from 'node:fs/promises'
import { getTableColumns, getTableName, sql, type Table } from 'drizzle-orm'
import type { createDrizzle } from '../client'
import { buildTableMap } from './table-map'

type Db = ReturnType<typeof createDrizzle> & {
  insert: (table: Table) => {
    values: (row: Record<string, unknown>) => {
      returning: (sel: { id: unknown }) => Promise<Array<{ id: number }>>
    }
  }
}

type Row = Record<string, unknown>

const CHILD_KEY = '@childDatas'

/**
 * 解析 db.json 占位符：
 * - `@id`：当前父行 id
 * - `@rootId`：根行 id（如 base_dict_type.id，供孙节点 typeId）
 */
function resolveTokens(
  value: unknown,
  parentId: number,
  rootId?: number,
): unknown {
  if (value === '@id') return parentId
  if (value === '@rootId') return rootId ?? parentId
  if (Array.isArray(value)) {
    return value.map((item) => resolveTokens(item, parentId, rootId))
  }
  if (value && typeof value === 'object') {
    const out: Row = {}
    for (const [key, val] of Object.entries(value)) {
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

async function insertReturningId(db: Db, table: Table, row: Row): Promise<number> {
  const cols = getTableColumns(table)
  const idCol = cols.id
  if (!idCol) {
    throw new Error(`[init] 表 ${getTableName(table)} 无 id 列，无法处理 @childDatas`)
  }
  const inserted = await db.insert(table).values(row).returning({ id: idCol })
  const id = inserted[0]?.id
  if (typeof id !== 'number') {
    throw new Error(`[init] 插入 ${table} 未返回 id`)
  }
  return id
}

async function insertRow(
  db: Db,
  tableMap: Map<string, Table>,
  tableName: string,
  row: Row,
  rootId?: number,
) {
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

/** 模块已初始化后，仅为 db.json 里仍为空的表补种 */
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
    if (!(await tableIsEmpty(db as Db, table))) continue

    for (const row of rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) continue
      await insertRow(db as Db, tableMap, tableName, row as Row)
    }
    console.log(`[init] db seed ← ${tableName}`)
  }
}

/** 导入单个模块 db.json */
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
