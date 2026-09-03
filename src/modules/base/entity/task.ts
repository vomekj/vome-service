import { integer, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core'
import { baseColumns, columnComments, entitySchemas } from '@core/server'

/**
 * 后台定时任务（本地任务）
 * taskType: cron=循环 / once=定时执行一次
 */
export const baseTask = columnComments(
  pgTable('base_task', {
    ...baseColumns,
    name: varchar('name').notNull(),
    /** IoC 服务类名（业务 @Provide 的类） */
    service: varchar('service').notNull(),
    method: varchar('method').notNull(),
    /** JSON 参数，传给 method */
    params: text('params'),
    /** cron | once */
    taskType: varchar('taskType').notNull().default('cron'),
    /** 循环：cron 表达式（可含秒） */
    cron: varchar('cron'),
    /** 一次：执行时间 */
    startDate: timestamp('startDate', { withTimezone: true }),
    /** 0 停 / 1 启 */
    status: integer('status').notNull().default(0),
    remark: varchar('remark'),
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

export const BaseTaskSchema = entitySchemas(baseTask)

export type BaseTask = typeof baseTask.$inferSelect
