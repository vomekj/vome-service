import { integer, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core'
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'
import { baseColumns, columnComments, entitySchemas } from '/#/server'

/**
 * 后台定时任务（本地任务）
 * taskType: cron=循环 / once=定时执行一次
 */
export const baseTask = columnComments(
  pgTable('base_task', {
    ...baseColumns,
    name: varchar('name', { length: 100 }).notNull(),
    /** IoC 服务类名（业务 @Provide 的类） */
    service: varchar('service', { length: 100 }).notNull(),
    method: varchar('method', { length: 100 }).notNull(),
    /** JSON 参数，传给 method */
    params: text('params'),
    /** cron | once */
    taskType: varchar('taskType', { length: 20 }).notNull().default('cron'),
    /** 循环：cron 表达式（可含秒） */
    cron: varchar('cron', { length: 100 }),
    /** 一次：执行时间 */
    startDate: timestamp('startDate', { withTimezone: true }),
    /** 0 停 / 1 启 */
    status: integer('status').notNull().default(0),
    remark: varchar('remark', { length: 500 }),
    lastRunTime: timestamp('lastRunTime', { withTimezone: true }),
  }),
  {
    name: '名称',
    service: '服务类',
    method: '方法',
    params: '参数',
    taskType: '任务类型',
    cron: 'Cron',
    startDate: '执行时间',
    status: '状态',
    remark: '备注',
    lastRunTime: '上次执行',
  },
)

export type BaseTask = InferSelectModel<typeof baseTask>
export type NewBaseTask = InferInsertModel<typeof baseTask>
export const BaseTaskSchema = entitySchemas(baseTask)
