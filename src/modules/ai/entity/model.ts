import {
  index,
  integer,
  jsonb,
  pgTable,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'
import { baseColumns, columnComments, entitySchemas } from '/#/server'
import type { AiAsyncSpec } from '../lib/ai/types'

/**
 * AI 模型（可调用实例）
 * code （tenantId 空时按 0）；调用上游时 model 字段用 code
 */
export const aiModel = columnComments(
  pgTable(
    'ai_model',
    {
      ...baseColumns,
      providerId: integer('providerId').notNull(),
      code: varchar('code', { length: 100 }).notNull(),
      /** 请求路径，如 /v1/chat/completions（必填，无框架默认） */
      path: varchar('path', { length: 500 }).notNull(),
      /** HTTP 方法，字典 base_http_method */
      method: varchar('method', { length: 16 }).notNull().default('POST'),
      /** 请求体类型：json | multipart，字典 base_ai_content_type */
      contentType: varchar('contentType', { length: 32 })
        .notNull()
        .default('json'),
      capabilities: jsonb('capabilities')
        .$type<string[]>()
        .notNull()
        .default([]),
      resultModes: jsonb('resultModes')
        .$type<string[]>()
        .notNull()
        .default(['sync']),
      /** 异步轮询契约（resultModes 含 async 时必填 pollPath） */
      asyncSpec: jsonb('asyncSpec').$type<AiAsyncSpec | null>(),
      defaults: jsonb('defaults').$type<Record<string, unknown>>(),
      status: integer('status').notNull().default(1),
      remark: varchar('remark', { length: 500 }),
    },
    (table) => [
      uniqueIndex('ai_model_tenant_code_uidx').on(table.tenantId, table.code),
      index('ai_model_provider_id_idx').on(table.providerId),
      index('ai_model_tenant_id_idx').on(table.tenantId),
    ],
  ),
  {
    providerId: '连接',
    code: '模型编码',
    path: '请求路径',
    method: '请求方法',
    contentType: '请求体类型',
    capabilities: '能力',
    resultModes: '结果形态',
    asyncSpec: '异步契约',
    defaults: '默认参数',
    status: '状态',
    remark: '备注',
  },
)

export type AiModel = InferSelectModel<typeof aiModel>
export type NewAiModel = InferInsertModel<typeof aiModel>
export const AiModelSchema = entitySchemas(aiModel)
