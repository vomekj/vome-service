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

/** AI 异步任务（视频等） */
export const aiTask = columnComments(
  pgTable(
    'ai_task',
    {
      ...baseColumns,
      taskKey: varchar('taskKey', { length: 64 }).notNull(),
      modelId: integer('modelId'),
      modelCode: varchar('modelCode', { length: 100 }),
      capability: varchar('capability', { length: 50 }).notNull(),
      /** pending | running | succeeded | failed */
      status: varchar('status', { length: 20 }).notNull().default('pending'),
      request: jsonb('request').$type<Record<string, unknown>>(),
      result: jsonb('result').$type<Record<string, unknown>>(),
      error: text('error'),
      upstreamId: varchar('upstreamId', { length: 200 }),
    },
    (table) => [
      index('ai_task_task_key_idx').on(table.taskKey),
      index('ai_task_tenant_id_idx').on(table.tenantId),
      index('ai_task_status_idx').on(table.status),
    ],
  ),
  {
    taskKey: '任务键',
    modelId: '模型ID',
    modelCode: '模型编码',
    capability: '能力',
    status: '状态',
    request: '请求',
    result: '结果',
    error: '错误',
    upstreamId: '上游任务ID',
  },
)

export type AiTask = InferSelectModel<typeof aiTask>
export type NewAiTask = InferInsertModel<typeof aiTask>
export const AiTaskSchema = entitySchemas(aiTask)
