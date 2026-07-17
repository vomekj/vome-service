/** 请求监控入库字段 */
export type RequestLogInput = {
  userId?: string | null
  side: 'admin' | 'app'
  ip?: string | null
  method: string
  action: string
  /** 日志类型：query/add/update/delete/... */
  logType: string
  params?: string | null
  response?: string | null
  duration: number
  status?: number | null
}

