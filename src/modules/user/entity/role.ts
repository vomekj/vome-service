import { integer, pgTable, text, varchar } from 'drizzle-orm/pg-core'
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'
import { baseColumns, columnComments, entitySchemas } from '/#/server'

/**
 * 前端角色（无菜单树）
 * perms：JSON 字符串数组，如页面/接口/按钮权限码
 */
export const userRole = columnComments(
  pgTable('user_role', {
    ...baseColumns,
    name: varchar('name', { length: 100 }).notNull(),
    label: varchar('label', { length: 100 }),
    remark: varchar('remark', { length: 500 }),
    status: integer('status').notNull().default(1),
    /** JSON string[]，如 ["page:home","api:order:list","btn:order:submit"] */
    perms: text('perms').notNull().default('[]'),
  }),
  {
    name: '名称',
    label: '标识',
    remark: '备注',
    status: '状态',
    perms: '权限',
  },
)

export type UserRole = InferSelectModel<typeof userRole>
export type NewUserRole = InferInsertModel<typeof userRole>
export const UserRoleSchema = entitySchemas(userRole)

/** 解析角色权限码 */
export function parseUserRolePerms(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((p): p is string => typeof p === 'string' && !!p)
  } catch {
    return []
  }
}
