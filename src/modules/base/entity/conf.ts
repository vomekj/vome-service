import { index, pgTable, text, uniqueIndex, varchar } from 'drizzle-orm/pg-core'
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'
import { baseColumns, columnComments, entitySchemas } from '/#/server'

/**
 * 系统配置（键值对）
 *
 * 用途：模块 init 状态（initDB:base）、后台可改的系统参数等
 */
export const baseConf = columnComments(
  pgTable(
    'base_conf',
    {
      ...baseColumns,
      cKey: varchar('cKey', { length: 255 }).notNull(),
      cValue: text('cValue'),
    },
    (table) => [
      uniqueIndex('base_conf_c_key_idx').on(table.cKey),
      index('base_conf_tenant_id_idx').on(table.tenantId),
    ],
  ),
  {
    cKey: '配置键',
    cValue: '配置值',
  },
)

export type BaseConf = InferSelectModel<typeof baseConf>
export type NewBaseConf = InferInsertModel<typeof baseConf>
export const BaseConfSchema = entitySchemas(baseConf)
