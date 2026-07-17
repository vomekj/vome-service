import { index, integer, pgTable, varchar } from 'drizzle-orm/pg-core'
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'
import { baseColumns, columnComments, entitySchemas } from '/#/server'

/** 部门（数据权限树） */
export const baseDepartment = columnComments(
  pgTable(
    'base_department',
    {
      ...baseColumns,
      parentId: integer('parentId'),
      name: varchar('name', { length: 100 }).notNull(),
      orderNum: integer('orderNum').notNull().default(0),
    },
    (table) => [index('base_department_parent_id_idx').on(table.parentId)],
  ),
  {
    parentId: '上级',
    name: '名称',
    orderNum: '排序',
  },
)

export type BaseDepartment = InferSelectModel<typeof baseDepartment>
export type NewBaseDepartment = InferInsertModel<typeof baseDepartment>
export const BaseDepartmentSchema = entitySchemas(baseDepartment)
