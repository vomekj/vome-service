import { integer, pgTable, text, varchar } from 'drizzle-orm/pg-core'
import { z } from 'zod'
import { baseColumns, columnComments, entitySchemas } from '@core/server'

/**
 * 前端角色（无菜单树）
 * perms：库内 JSON 字符串；写接口可收 string[] 或 string
 */
export const userRole = columnComments(
  pgTable('user_role', {
    ...baseColumns,
    name: varchar('name').notNull(),
    label: varchar('label'),
    remark: varchar('remark'),
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

const permsInput = z
  .union([z.array(z.string()), z.string()])
  .optional()
  .transform((v) => {
    if (Array.isArray(v)) return JSON.stringify(v)
    if (typeof v === 'string' && v.trim()) return v
    return '[]'
  })

export const UserRoleSchema = entitySchemas(userRole)
UserRoleSchema.insert = UserRoleSchema.insert.extend({ perms: permsInput })
UserRoleSchema.update = UserRoleSchema.update.extend({ perms: permsInput })

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
