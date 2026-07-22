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

/** 后台侧栏共用 `base_menu`；仅当模块自建了 `{module}_menu` 时写那张表。 */
function resolveMenuTable(
  tableMap: Map<string, Table>,
  module: string,
): { tableName: string; table: Table } | null {
  const own = `${module}_menu`
  const ownTable = tableMap.get(own)
  if (ownTable) return { tableName: own, table: ownTable }

  const base = tableMap.get('base_menu')
  if (base) return { tableName: 'base_menu', table: base }

  return null
}

/** 导入单个模块 menu.json；无菜单表时返回 false */
export async function importModuleMenu(
  file: string,
  db: ReturnType<typeof createDrizzle>,
  schema: Record<string, unknown>,
  module: string,
): Promise<boolean> {
  const tableMap = buildTableMap(schema)
  const resolved = resolveMenuTable(tableMap, module)
  if (!resolved) {
    console.warn(`[init] 跳过 menu（${module}）：schema 中无菜单表`)
    return false
  }

  const { tableName, table } = resolved
  if (tableName === 'base_menu' && module !== 'base') {
    console.log(`[init] menu ${module} → base_menu`)
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
