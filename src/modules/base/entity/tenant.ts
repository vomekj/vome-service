import {
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'
import { columnComments, entitySchemas } from '/#/server'

/**
 * 租户（商户）主表
 * 不含 tenantId：租户本身是隔离边界，不受行级租户过滤
 */
export const baseTenant = columnComments(
  pgTable(
    'base_tenant',
    {
      id: serial('id').primaryKey(),
      createTime: timestamp('createTime', { withTimezone: true })
        .notNull()
        .defaultNow(),
      updateTime: timestamp('updateTime', { withTimezone: true })
        .notNull()
        .defaultNow()
        .$onUpdate(() => new Date()),
      deletedAt: timestamp('deletedAt', { withTimezone: true }),
      name: varchar('name', { length: 100 }).notNull(),
      code: varchar('code', { length: 64 }).notNull(),
      /** 绑定域名列表（小写、无端口） */
      domains: jsonb('domains').$type<string[]>().notNull().default([]),
      status: integer('status').notNull().default(1),
      remark: varchar('remark', { length: 500 }),
    },
    (table) => [
      uniqueIndex('base_tenant_code_idx').on(table.code),
      index('base_tenant_status_idx').on(table.status),
    ],
  ),
  {
    name: '名称',
    code: '编码',
    domains: '域名',
    status: '状态',
    remark: '备注',
  },
)

export type BaseTenant = InferSelectModel<typeof baseTenant>
export type NewBaseTenant = InferInsertModel<typeof baseTenant>
export const BaseTenantSchema = entitySchemas(baseTenant)
