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

/**
 * AI 模型（可调用实例）
 * code 租户内唯一（tenantId 空时按 0）
 */
export const aiModel = columnComments(
  pgTable(
    'ai_model',
    {
      ...baseColumns,
      providerId: integer('providerId').notNull(),
      code: varchar('code', { length: 100 }).notNull(),
      name: varchar('name', { length: 100 }).notNull(),
      upstreamId: varchar('upstreamId', { length: 200 }).notNull(),
      capabilities: jsonb('capabilities')
        .$type<string[]>()
        .notNull()
        .default([]),
      resultModes: jsonb('resultModes')
        .$type<string[]>()
        .notNull()
        .default(['sync']),
      defaults: jsonb('defaults').$type<Record<string, unknown>>(),
      /**
       * 上游路径覆盖（不配则 OpenAI 默认）
       * chat / image / audio_tts / audio_stt / embed / video / videoGet / videoContent
       */
      paths: jsonb('paths').$type<Record<string, string>>(),
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
    name: '名称',
    upstreamId: '上游模型ID',
    capabilities: '能力',
    resultModes: '结果形态',
    defaults: '默认参数',
    paths: '路径覆盖',
    status: '状态',
    remark: '备注',
  },
)

export type AiModel = InferSelectModel<typeof aiModel>
export type NewAiModel = InferInsertModel<typeof aiModel>
export const AiModelSchema = entitySchemas(aiModel)
