import { index, integer, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core'
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'
import { baseColumns, columnComments, entitySchemas } from '/#/server'

/** 前端用户（user_info.id）↔ 角色 */
export const userInfoRole = columnComments(
  pgTable(
    'user_info_role',
    {
      ...baseColumns,
      userId: text('userId').notNull(),
      roleId: integer('roleId').notNull(),
    },
    (table) => [
      index('user_info_role_user_id_idx').on(table.userId),
      index('user_info_role_role_id_idx').on(table.roleId),
      uniqueIndex('user_info_role_user_role_uidx').on(table.userId, table.roleId),
    ],
  ),
  {
    userId: '用户',
    roleId: '角色',
  },
)

export type UserInfoRole = InferSelectModel<typeof userInfoRole>
export type NewUserInfoRole = InferInsertModel<typeof userInfoRole>
export const UserInfoRoleSchema = entitySchemas(userInfoRole)
