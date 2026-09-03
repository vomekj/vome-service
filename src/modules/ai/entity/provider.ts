import {
  index,
  integer,
  jsonb,
  pgTable,
  varchar,
} from 'drizzle-orm/pg-core'
import { baseColumns, columnComments, entitySchemas } from '@core/server'

/**
 * AI 连接（厂商实例 / 密钥）
 * protocol 见字典 base_ai_protocol；vendor 自由文本
 */
export const aiProvider = columnComments(
  pgTable(
    'ai_provider',
    {
      ...baseColumns,
      vendor: varchar('vendor').notNull(),
      protocol: varchar('protocol')
        .notNull()
        .default('openai_compatible'),
      baseUrl: varchar('baseUrl').notNull(),
      /** AES 密文，见 encryptSecret */
      apiKey: varchar('apiKey').notNull(),
      extra: jsonb('extra').$type<Record<string, unknown>>(),
      /** 0 停 / 1 启 */
      status: integer('status').notNull().default(1),
      remark: varchar('remark'),
    },
    (table) => [
      index('ai_provider_tenant_id_idx').on(table.tenantId),
      index('ai_provider_protocol_idx').on(table.protocol),
    ],
  ),
  {
    vendor: '厂商',
    protocol: '协议',
    baseUrl: '接口地址',
    apiKey: 'API密钥',
    extra: '扩展配置',
    status: '状态',
    remark: '备注',
  },
)

export const AiProviderSchema = entitySchemas(aiProvider)
