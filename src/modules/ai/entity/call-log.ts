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
 * AI 调用记录（同步 / 流式 / 异步统一）
 * 异步轮询用 recordKey（对外仍称 taskId）
 */
export const aiCallLog = columnComments(
  pgTable(
    'ai_call_log',
    {
      ...baseColumns,
      /** 异步任务号 ait_*；同步/流式为空 */
      recordKey: varchar('recordKey', { length: 64 }),
      modelCode: varchar('modelCode', { length: 100 }),
      capability: varchar('capability', { length: 50 }).notNull(),
      /** sync | stream | async */
      mode: varchar('mode', { length: 20 }).notNull(),
      /** 异步：pending | running | succeeded | failed */
      status: varchar('status', { length: 20 }),
      ok: integer('ok').notNull().default(0),
      latencyMs: integer('latencyMs'),
      inputTokens: integer('inputTokens'),
      outputTokens: integer('outputTokens'),
      totalTokens: integer('totalTokens'),
      errorCode: varchar('errorCode', { length: 64 }),
      errorMessage: text('errorMessage'),
      /** gateway | proxy | test */
      source: varchar('source', { length: 32 }).notNull().default('gateway'),
      upstreamId: varchar('upstreamId', { length: 200 }),
      request: jsonb('request').$type<Record<string, unknown>>(),
      result: jsonb('result').$type<Record<string, unknown>>(),
    },
    (table) => [
      index('ai_call_log_tenant_id_idx').on(table.tenantId),
      index('ai_call_log_model_code_idx').on(table.modelCode),
      index('ai_call_log_record_key_idx').on(table.recordKey),
      index('ai_call_log_status_idx').on(table.status),
      index('ai_call_log_create_time_idx').on(table.createTime),
    ],
  ),
  {
    recordKey: '任务号',
    modelCode: '模型编码',
    capability: '能力',
    mode: '形态',
    status: '任务状态',
    ok: '成功',
    latencyMs: '耗时ms',
    inputTokens: '输入token',
    outputTokens: '输出token',
    totalTokens: '总token',
    errorCode: '错误码',
    errorMessage: '错误信息',
    source: '来源',
    upstreamId: '上游任务ID',
    request: '请求参数',
    result: '响应结果',
  },
)

export type AiCallLog = InferSelectModel<typeof aiCallLog>
export type NewAiCallLog = InferInsertModel<typeof aiCallLog>
export const AiCallLogSchema = entitySchemas(aiCallLog)
