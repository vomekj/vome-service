import { index, integer, pgTable, uniqueIndex } from 'drizzle-orm/pg-core'
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'
import { baseColumns, columnComments, entitySchemas } from '/#/server'

/** 后台用户 ↔ 角色 */
export const baseUserRole = columnComments(
  pgTable(
    'base_user_role',
    {
      ...baseColumns,
      userId: integer('userId').notNull(),
      roleId: integer('roleId').notNull(),
    },
    (table) => [
      index('base_user_role_user_id_idx').on(table.userId),
      index('base_user_role_role_id_idx').on(table.roleId),
      uniqueIndex('base_user_role_user_role_uidx').on(table.userId, table.roleId),
    ],
  ),
  {
    userId: '用户',
    roleId: '角色',
  },
)

export type BaseUserRole = InferSelectModel<typeof baseUserRole>
export type NewBaseUserRole = InferInsertModel<typeof baseUserRole>
export const BaseUserRoleSchema = entitySchemas(baseUserRole)
