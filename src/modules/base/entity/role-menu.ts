import { index, integer, pgTable, uniqueIndex } from 'drizzle-orm/pg-core'
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'
import { baseColumns, columnComments, entitySchemas } from '/#/server'

/** 后台角色 ↔ 菜单 */
export const baseRoleMenu = columnComments(
  pgTable(
    'base_role_menu',
    {
      ...baseColumns,
      roleId: integer('roleId').notNull(),
      menuId: integer('menuId').notNull(),
    },
    (table) => [
      index('base_role_menu_role_id_idx').on(table.roleId),
      index('base_role_menu_menu_id_idx').on(table.menuId),
      uniqueIndex('base_role_menu_role_menu_uidx').on(table.roleId, table.menuId),
    ],
  ),
  {
    roleId: '角色',
    menuId: '菜单',
  },
)

export type BaseRoleMenu = InferSelectModel<typeof baseRoleMenu>
export type NewBaseRoleMenu = InferInsertModel<typeof baseRoleMenu>
export const BaseRoleMenuSchema = entitySchemas(baseRoleMenu)
