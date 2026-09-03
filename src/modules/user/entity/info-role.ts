import { index, integer, pgTable, uniqueIndex } from 'drizzle-orm/pg-core'
import { baseColumns, columnComments, entitySchemas } from '@core/server'

/** 前端用户（user_info.userId 自增）↔ 角色 */
export const userInfoRole = columnComments(
  pgTable(
    'user_info_role',
    {
      ...baseColumns,
      userId: integer('userId').notNull(),
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

export const UserInfoRoleSchema = entitySchemas(userInfoRole)
