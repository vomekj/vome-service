import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  varchar,
} from 'drizzle-orm/pg-core'
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'
import { baseColumns, columnComments, entitySchemas } from '/#/server'

/**
 * AI 连接（厂商实例 / 密钥）
 * protocol 见字典 base_ai_protocol；vendor 自由文本
 */
export const aiProvider = columnComments(
  pgTable(
    'ai_provider',
    {
      ...baseColumns,
      vendor: varchar('vendor', { length: 100 }).notNull(),
      protocol: varchar('protocol', { length: 50 })
        .notNull()
        .default('openai_compatible'),
      baseUrl: varchar('baseUrl', { length: 500 }).notNull(),
      /** AES 密文，见 encryptSecret */
      apiKey: text('apiKey').notNull(),
      extra: jsonb('extra').$type<Record<string, unknown>>(),
      /** 0 停 / 1 启 */
      status: integer('status').notNull().default(1),
      remark: varchar('remark', { length: 500 }),
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

export type AiProvider = InferSelectModel<typeof aiProvider>
export type NewAiProvider = InferInsertModel<typeof aiProvider>
export const AiProviderSchema = entitySchemas(aiProvider)
