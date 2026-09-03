import { and, eq, isNull, ne } from 'drizzle-orm'
import {
  BaseService,
  CommException,
  InjectRepository,
  Provide,
  type Repository,
} from '@core/server'
import { baseParam } from '../entity/param'

const PARAM_TYPES = new Set([0, 1, 2, 3])

/**
 * 系统参数
 */
@Provide()
export class BaseParamService extends BaseService {
  @InjectRepository(baseParam)
  paramRepo: Repository<typeof baseParam>

  /**
   * 按 keyName 取参数 data（后台 / 内部，不校验 App 开放）。
   * JSON（type=3）可传 path 链式取值，如 get('user', 'info.name')。
   */
  async get(keyName: string, path?: string): Promise<unknown> {
    const row = await this.findByKey(keyName)
    if (!row) return null
    return this.readData(row, path)
  }

  /**
   * 点路径取值（内部）：首段为 keyName，其余为 JSON 内路径。
   */
  async getByPath(dotPath: string): Promise<unknown> {
    const parts = this.splitPath(dotPath)
    if (!parts.length) return null
    const [keyName, ...rest] = parts
    return this.get(keyName!, rest.length ? rest.join('.') : undefined)
  }

  /**
   * App 端取值：参数须 openToApp=1；JSON 仅返回 appOpenPaths 中开放的键。
   */
  async getForApp(keyName: string, path?: string): Promise<unknown> {
    const row = await this.findByKey(keyName)
    if (!row) return null
    if (Number(row.openToApp) !== 1) {
      throw new CommException('参数未对 App 开放')
    }

    const openPaths = this.parseOpenPaths(row.appOpenPaths)
    const value = this.readData(row, path, openPaths)
    return value
  }

  /**
   * App 端点路径：首段 keyName，其余 JSON 路径；须整条链路均开放。
   */
  async getByPathForApp(dotPath: string): Promise<unknown> {
    const parts = this.splitPath(dotPath)
    if (!parts.length) return null
    const [keyName, ...rest] = parts
    return this.getForApp(keyName!, rest.length ? rest.join('.') : undefined)
  }

  private async findByKey(keyName: string) {
    const key = String(keyName ?? '').trim()
    if (!key) return null
    return this.paramRepo.findOne(
      and(eq(baseParam.keyName, key), isNull(baseParam.deletedTime)),
    )
  }

  private splitPath(dotPath: string) {
    return String(dotPath ?? '')
      .split('.')
      .map((s) => s.trim())
      .filter(Boolean)
  }

  private parseOpenPaths(raw: unknown): Set<string> {
    const text = String(raw ?? '').trim()
    if (!text) return new Set()
    try {
      const parsed = JSON.parse(text) as unknown
      if (!Array.isArray(parsed)) return new Set()
      return new Set(
        parsed
          .map((v) => String(v ?? '').trim())
          .filter(Boolean),
      )
    } catch {
      return new Set()
    }
  }

  private isPathOpen(openPaths: Set<string>, path: string): boolean {
    const parts = this.splitPath(path)
    let acc = ''
    for (const part of parts) {
      acc = acc ? `${acc}.${part}` : part
      if (!openPaths.has(acc)) return false
    }
    return true
  }

  private filterOpenObject(
    obj: Record<string, unknown>,
    openPaths: Set<string>,
    prefix = '',
  ): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${key}` : key
      if (!openPaths.has(path)) continue
      if (value != null && typeof value === 'object' && !Array.isArray(value)) {
        out[key] = this.filterOpenObject(
          value as Record<string, unknown>,
          openPaths,
          path,
        )
      } else {
        out[key] = value
      }
    }
    return out
  }

  private readData(
    row: {
      type: number | null
      data: string | null
      appOpenPaths?: string | null
    },
    path?: string,
    openPaths?: Set<string>,
  ): unknown {
    const raw = row.data != null ? String(row.data) : ''
    if (Number(row.type) !== 3) {
      if (openPaths && path) return null
      return raw || null
    }

    let root: unknown
    try {
      root = JSON.parse(raw || '{}')
    } catch {
      return null
    }
    if (root == null || typeof root !== 'object' || Array.isArray(root)) {
      return null
    }

    let data = root as Record<string, unknown>
    if (openPaths) {
      data = this.filterOpenObject(data, openPaths)
    }

    const p = String(path ?? '').trim()
    if (!p) return data

    if (openPaths && !this.isPathOpen(openPaths, p)) {
      return undefined
    }
    return this.pickPath(data, p)
  }

  private pickPath(root: unknown, path: string): unknown {
    const parts = this.splitPath(path)
    let cur: unknown = root
    for (const part of parts) {
      if (cur == null || typeof cur !== 'object' || Array.isArray(cur)) {
        return undefined
      }
      cur = (cur as Record<string, unknown>)[part]
    }
    return cur
  }

  private async prepareParam(data: Record<string, unknown>, type: 'add' | 'update') {
    /** 表格内仅切换对 App 开放 */
    if (type === 'update') {
      const keys = Object.keys(data).filter(
        (k) => k !== 'id' && data[k] !== undefined,
      )
      if (keys.length === 1 && keys[0] === 'openToApp') {
        data.openToApp = Number(data.openToApp) === 1 ? 1 : 0
        return
      }
    }

    if (data.name != null) data.name = String(data.name).trim()
    if (data.keyName != null) data.keyName = String(data.keyName).trim()

    const paramType = Number(data.type ?? 0)
    if (!PARAM_TYPES.has(paramType)) {
      throw new CommException('类型无效')
    }
    data.type = paramType
    data.openToApp = Number(data.openToApp) === 1 ? 1 : 0

    const content = data.data != null ? String(data.data).trim() : ''
    if (!content) throw new CommException('数据不能为空')

    if (paramType === 3) {
      let parsed: unknown
      try {
        parsed = JSON.parse(content)
      } catch {
        throw new CommException('JSON 格式无效')
      }
      if (
        parsed == null ||
        typeof parsed !== 'object' ||
        Array.isArray(parsed)
      ) {
        throw new CommException('JSON 须为对象')
      }
      data.data = JSON.stringify(parsed)

      const pathsRaw = data.appOpenPaths
      let paths: string[] = []
      if (Array.isArray(pathsRaw)) {
        paths = pathsRaw.map((v) => String(v ?? '').trim()).filter(Boolean)
      } else if (pathsRaw != null && String(pathsRaw).trim()) {
        try {
          const p = JSON.parse(String(pathsRaw)) as unknown
          if (Array.isArray(p)) {
            paths = p.map((v) => String(v ?? '').trim()).filter(Boolean)
          }
        } catch {
          throw new CommException('JSON 开放路径无效')
        }
      }
      data.appOpenPaths = JSON.stringify(paths)
    } else {
      data.data = content
      data.appOpenPaths = null
    }

    if (data.remark != null) {
      data.remark = String(data.remark).trim() || null
    }

    const keyName = String(data.keyName ?? '').trim()
    if (!keyName) return

    const id = data.id != null ? Number(data.id) : NaN
    const conds = [
      eq(baseParam.keyName, keyName),
      isNull(baseParam.deletedTime),
    ]
    if (Number.isInteger(id) && id > 0) {
      conds.push(ne(baseParam.id, id))
    }
    const exists = await this.paramRepo.findOne(and(...conds))
    if (exists) throw new CommException('keyName 已存在')
  }

  override async add(data: unknown, options?: Parameters<BaseService['add']>[1]) {
    const rows = Array.isArray(data) ? data : [data]
    for (const raw of rows) {
      if (raw != null && typeof raw === 'object') {
        await this.prepareParam(raw as Record<string, unknown>, 'add')
      }
    }
    return super.add(data, options)
  }

  override async update(
    whereOrData: Parameters<BaseService['update']>[0],
    data?: unknown,
  ) {
    if (data !== undefined) {
      if (data != null && typeof data === 'object' && !Array.isArray(data)) {
        await this.prepareParam(data as Record<string, unknown>, 'update')
      }
      return super.update(whereOrData as never, data)
    }
    const rows = Array.isArray(whereOrData)
      ? whereOrData
      : [whereOrData as Record<string, unknown>]
    for (const row of rows) {
      await this.prepareParam(row, 'update')
    }
    return super.update(whereOrData)
  }
}
