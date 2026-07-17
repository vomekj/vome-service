import { boolean, integer, pgTable, varchar } from 'drizzle-orm/pg-core'
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'
import { baseColumns, columnComments, entitySchemas } from '/#/server'

/** 后台角色 */
export const baseRole = columnComments(
  pgTable('base_role', {
    ...baseColumns,
    name: varchar('name', { length: 100 }).notNull(),
    label: varchar('label', { length: 100 }),
    remark: varchar('remark', { length: 500 }),
    /** 0=全部数据 1=自定义部门 */
    dataScope: integer('dataScope').notNull().default(0),
    /** 关联上下级：勾选父节点时包含子部门 */
    relevance: boolean('relevance').notNull().default(false),
    status: integer('status').notNull().default(1),
  }),
  {
    name: '名称',
    label: '标识',
    remark: '备注',
    dataScope: '数据权限',
    relevance: '关联上下级',
    status: '状态',
  },
)

export type BaseRole = InferSelectModel<typeof baseRole>
export type NewBaseRole = InferInsertModel<typeof baseRole>
export const BaseRoleSchema = entitySchemas(baseRole)
