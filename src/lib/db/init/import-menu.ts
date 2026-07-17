import { readFile } from 'node:fs/promises'
import { getTableColumns, type Table } from 'drizzle-orm'
import type { createDrizzle } from '../client'
import { buildTableMap } from './table-map'

type Db = ReturnType<typeof createDrizzle> & {
  insert: (table: Table) => {
    values: (row: Record<string, unknown>) => {
      returning: (sel: { id: unknown }) => Promise<Array<{ id: number }>>
    }
  }
}

type MenuNode = Record<string, unknown> & {
  childMenus?: MenuNode[]
}

async function insertMenuNode(
  db: Db,
  table: Table,
  tableName: string,
  node: MenuNode,
  parentId: number | null,
) {
  const { childMenus, ...fields } = node
  const cols = getTableColumns(table)
  const idCol = cols.id
  if (!idCol) throw new Error(`[init] ${tableName} 缺少 id 列`)

  const row = { ...fields, parentId }
  const inserted = await db.insert(table).values(row).returning({ id: idCol })
  const id = inserted[0]?.id
  if (typeof id !== 'number') throw new Error(`[init] 插入菜单失败`)

  if (Array.isArray(childMenus)) {
    for (const child of childMenus) {
      await insertMenuNode(db, table, tableName, child, id)
    }
  }
}

/** 导入单个模块 menu.json；表名为 `{module}_menu`，无表时返回 false */
export async function importModuleMenu(
  file: string,
  db: ReturnType<typeof createDrizzle>,
  schema: Record<string, unknown>,
  module: string,
): Promise<boolean> {
  const tableName = `${module}_menu`
  const tableMap = buildTableMap(schema)
  const table = tableMap.get(tableName)
  if (!table) {
    console.warn(`[init] 跳过 menu：schema 中无 ${tableName} 表`)
    return false
  }

  const raw = await readFile(file, 'utf8')
  const menus = JSON.parse(raw) as MenuNode[]
  if (!Array.isArray(menus)) {
    throw new Error(`[init] menu.json 根节点必须是数组`)
  }

  for (const menu of menus) {
    await insertMenuNode(db as Db, table, tableName, menu, null)
  }
  return true
}
