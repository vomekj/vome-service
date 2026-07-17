import { index, integer, pgTable, uniqueIndex } from 'drizzle-orm/pg-core'
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'
import { baseColumns, columnComments, entitySchemas } from '/#/server'

/** 角色 ↔ 部门（数据权限） */
export const baseRoleDepartment = columnComments(
  pgTable(
    'base_role_department',
    {
      ...baseColumns,
      roleId: integer('roleId').notNull(),
      departmentId: integer('departmentId').notNull(),
    },
    (table) => [
      index('base_role_department_role_id_idx').on(table.roleId),
      index('base_role_department_department_id_idx').on(table.departmentId),
      uniqueIndex('base_role_department_role_dept_uidx').on(
        table.roleId,
        table.departmentId,
      ),
    ],
  ),
  {
    roleId: '角色',
    departmentId: '部门',
  },
)

export type BaseRoleDepartment = InferSelectModel<typeof baseRoleDepartment>
export type NewBaseRoleDepartment = InferInsertModel<typeof baseRoleDepartment>
export const BaseRoleDepartmentSchema = entitySchemas(baseRoleDepartment)
