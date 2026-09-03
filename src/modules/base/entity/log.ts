import { integer, pgTable, text, varchar } from 'drizzle-orm/pg-core'
import { baseColumns, columnComments, entitySchemas } from '@core/server'

/**
 * 请求监控日志（admin / app 全量）
 *
 * params / response 用 text：PostgreSQL TOAST 大字段行外存储，不拖垮主表扫描。
 */
export const baseLog = columnComments(
  pgTable('base_log', {
    ...baseColumns,
    /** 操作者：adminId 或 app userId，未登录为空 */
    userId: varchar('userId'),
    /** admin | app */
    side: varchar('side').notNull(),
    ip: varchar('ip'),
    method: varchar('method').notNull(),
    /** 路径（不含 query） */
    action: varchar('action').notNull(),
    /** 日志类型：public/query/add/update/delete/import/export/restore/other/error */
    logType: varchar('logType'),
    /** 请求参数 JSON（query + body，不截断） */
    params: text('params'),
    /** 响应体全文（不截断） */
    response: text('response'),
    /** 耗时 ms */
    duration: integer('duration').notNull().default(0),
    /** HTTP status */
    status: integer('status'),
  }),
  {
    userId: '操作者',
    side: '端',
    ip: 'IP',
    method: '方法',
    action: '路径',
    logType: '日志类型',
    params: '请求参数',
    response: '响应',
    duration: '响应时间',
    status: '状态码',
    createTime: '请求时间',
  },
)

export const BaseLogSchema = entitySchemas(baseLog)
