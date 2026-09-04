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
import { columnComments, entitySchemas } from '@core/server'

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
      deleteTime: timestamp('deleteTime', { withTimezone: true }),
      name: varchar('name').notNull(),
      code: varchar('code').notNull(),
      /** 绑定域名列表（小写、无端口） */
      domains: jsonb('domains').$type<string[]>().notNull().default([]),
      status: integer('status').notNull().default(1),
      remark: varchar('remark'),
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

export const BaseTenantSchema = entitySchemas(baseTenant)
