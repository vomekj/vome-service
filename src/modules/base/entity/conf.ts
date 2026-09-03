import { index, pgTable, text, uniqueIndex, varchar } from 'drizzle-orm/pg-core'
import { baseColumns, columnComments, entitySchemas } from '@core/server'

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
      cKey: varchar('cKey').notNull(),
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

export const BaseConfSchema = entitySchemas(baseConf)
