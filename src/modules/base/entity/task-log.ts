import { index, integer, pgTable, text } from 'drizzle-orm/pg-core'
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'
import { baseColumns, columnComments, entitySchemas } from '/#/server'

/**
 * 定时任务执行日志
 * status: 0 失败 / 1 成功
 */
export const baseTaskLog = columnComments(
  pgTable(
    'base_task_log',
    {
      ...baseColumns,
      taskId: integer('taskId'),
      /** 0 失败 / 1 成功 */
      status: integer('status').notNull().default(0),
      detail: text('detail'),
    },
    (table) => [index('base_task_log_task_id_idx').on(table.taskId)],
  ),
  {
    taskId: '任务ID',
    status: '状态',
    detail: '详情描述',
  },
)

export type BaseTaskLog = InferSelectModel<typeof baseTaskLog>
export type NewBaseTaskLog = InferInsertModel<typeof baseTaskLog>
export const BaseTaskLogSchema = entitySchemas(baseTaskLog)
