import { getTableName, isTable, type Table } from 'drizzle-orm'

/** 表名 → Drizzle table（db.json 的 key 用 SQL 表名） */
export function buildTableMap(schema: Record<string, unknown>): Map<string, Table> {
  const map = new Map<string, Table>()
  for (const value of Object.values(schema)) {
    if (isTable(value)) map.set(getTableName(value), value)
  }
  return map
}
