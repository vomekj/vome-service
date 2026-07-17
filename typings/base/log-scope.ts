/** 请求日志写入范围（多选，存 ConfService） */
export type LogScope =
  | 'all'
  | 'public'
  | 'query'
  | 'add'
  | 'update'
  | 'delete'
  | 'import'
  | 'export'
  | 'restore'
  | 'other'
  | 'error'

/** 入库的日志类型（不含 all） */
export type LogType = Exclude<LogScope, 'all'>

export const LOG_SCOPE_KEY = 'logScope'

/** 旧版范围：已并入 error，normalize 时丢弃并补上 error */
const LEGACY_SCOPES = new Set(['unauthorized', 'forbidden'])

/** 默认：其它(业务自定义) + 查询 + 更新 + 删除 + 异常（不含开放接口） */
export const DEFAULT_LOG_SCOPES: LogScope[] = [
  'other',
  'query',
  'update',
  'delete',
  'error',
]

export const LOG_SCOPE_OPTIONS: Array<{ value: LogScope; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'other', label: '其它' },
  { value: 'query', label: '查询' },
  { value: 'add', label: '新增' },
  { value: 'update', label: '更新' },
  { value: 'delete', label: '删除' },
  { value: 'import', label: '导入' },
  { value: 'export', label: '导出' },
  { value: 'restore', label: '恢复' },
  { value: 'public', label: '开放接口' },
  { value: 'error', label: '异常' },
]

export const LOG_TYPE_LABEL: Record<LogType, string> = {
  public: '开放接口',
  query: '查询',
  add: '新增',
  update: '更新',
  delete: '删除',
  import: '导入',
  export: '导出',
  restore: '恢复',
  other: '其它',
  error: '异常',
}

/** 系统内置 CRUD / 导入导出等路径末段 */
const BUILTIN_ACTIONS = new Set([
  'page',
  'info',
  'list',
  'add',
  'update',
  'delete',
  'import',
  'importTemplate',
  'export',
  'restore',
])

const ALL_SCOPES = new Set<LogScope>(LOG_SCOPE_OPTIONS.map((o) => o.value))

export function normalizeLogScopes(raw: unknown): LogScope[] {
  if (!Array.isArray(raw)) return [...DEFAULT_LOG_SCOPES]
  let hadLegacy = false
  const list: LogScope[] = []
  for (const item of raw) {
    const v = String(item)
    if (LEGACY_SCOPES.has(v)) {
      hadLegacy = true
      continue
    }
    if (ALL_SCOPES.has(v as LogScope)) list.push(v as LogScope)
  }
  if (!list.length) return [...DEFAULT_LOG_SCOPES]
  if (list.includes('all')) return ['all']
  if (hadLegacy && !list.includes('error')) list.push('error')
  return [...new Set(list)]
}

function pathAction(path: string): string {
  const clean = path.replace(/\/+$/, '') || '/'
  const i = clean.lastIndexOf('/')
  return i >= 0 ? clean.slice(i + 1) : clean
}

/** 从响应体取业务码（1000/1001）；Elysia status(401, body) 会嵌在 response 里 */
export function extractBizCode(response: unknown): number | null {
  if (response == null || typeof response !== 'object') return null
  const r = response as Record<string, unknown>
  if (typeof r.code === 'number' && r.code >= 1000) return r.code
  const nested = r.response
  if (nested && typeof nested === 'object') {
    const n = nested as Record<string, unknown>
    if (typeof n.code === 'number' && n.code >= 1000) return n.code
  }
  return null
}

type ScopeMatchInput = {
  method: string
  path: string
  status: number
  bizCode: number | null
  /** 是否 @Public() 开放接口 */
  isPublic?: boolean
  unhandledError?: boolean
}

function isErrorResult(input: ScopeMatchInput): boolean {
  if (input.unhandledError) return true
  if (input.status >= 500) return true
  if (input.bizCode != null && input.bizCode !== 1000) return true
  // 401/403 并入异常（原需登入 / 无权限）
  if (input.status >= 400) return true
  return false
}

function resolveActionType(method: string, path: string): LogType | null {
  const action = pathAction(path)
  const m = method.toUpperCase()
  if (action === 'page' || action === 'info' || action === 'list') return 'query'
  if (action === 'add') return 'add'
  if (action === 'update' || m === 'PUT' || m === 'PATCH') return 'update'
  if (action === 'delete' || m === 'DELETE') return 'delete'
  if (action === 'import' || action === 'importTemplate') return 'import'
  if (action === 'export') return 'export'
  if (action === 'restore') return 'restore'
  return null
}

/**
 * 业务自定义接口：非系统内置 CRUD（page/info/list/add/update/delete/import/export/restore）
 * 例如用户自写的 openBox、submitOrder 等（不含 @Public 开放接口）
 */
export function isOtherAction(method: string, path: string): boolean {
  const action = pathAction(path)
  const m = method.toUpperCase()
  if (m === 'PUT' || m === 'PATCH' || m === 'DELETE') return false
  return !BUILTIN_ACTIONS.has(action)
}

/**
 * 解析日志类型。
 * 产品优先级：异常 > 其它(业务自定义) > 内置 CRUD > 开放接口(@Public)
 */
export function resolveLogType(input: ScopeMatchInput): LogType {
  if (isErrorResult(input)) return 'error'
  if (!input.isPublic) {
    return resolveActionType(input.method, input.path) ?? 'other'
  }
  return 'public'
}

/**
 * 是否写入日志。
 * 异常与操作类型为 OR；@Public 仅在勾选「开放接口」时写入（不被「其它」收走）。
 */
export function shouldRecordByScope(
  scopes: LogScope[],
  input: ScopeMatchInput,
): boolean {
  const set = new Set(normalizeLogScopes(scopes))
  if (set.has('all')) return true

  if (set.has('error') && isErrorResult(input)) return true

  // 开放接口与其它/内置互斥：未勾 public 则一律不记（失败已由 error 处理）
  if (input.isPublic) return set.has('public')

  const { method, path } = input
  const action = pathAction(path)
  const m = method.toUpperCase()

  if (set.has('query')) {
    if (action === 'page' || action === 'info' || action === 'list') return true
  }
  if (set.has('add') && action === 'add') return true
  if (set.has('update') && (action === 'update' || m === 'PUT' || m === 'PATCH'))
    return true
  if (set.has('delete') && (action === 'delete' || m === 'DELETE')) return true
  if (set.has('import') && (action === 'import' || action === 'importTemplate'))
    return true
  if (set.has('export') && action === 'export') return true
  if (set.has('restore') && action === 'restore') return true
  if (set.has('other') && isOtherAction(method, path)) return true

  return false
}
