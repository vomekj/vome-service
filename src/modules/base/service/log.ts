import { isNotNull, lt } from 'drizzle-orm'
import { Inject, Provide } from '/#/server'
import type { RequestLogInput } from '../../../../typings/base/log'
import {
  DEFAULT_LOG_SCOPES,
  LOG_SCOPE_KEY,
  LOG_SCOPE_OPTIONS,
  normalizeLogScopes,
  shouldRecordByScope,
  type LogScope,
} from '../../../../typings/base/log-scope'
import { InjectRepository, type Repository } from '/#/server'
import { BaseService } from '/#/server'
import { baseLog } from '../entity/log'
import { ConfService } from './conf'

const LOG_KEEP_KEY = 'logKeep'
const DEFAULT_KEEP_DAYS = 30

/** 最多延迟 5s 刷盘（有数据就刷） */
const FLUSH_MS = 5000
/** 满 50 条立刻刷 */
const FLUSH_SIZE = 50

@Provide()
export class LogService extends BaseService {
  @InjectRepository(baseLog)
  logRepo: Repository<typeof baseLog>
  @Inject()
  conf: ConfService

  private buffer: RequestLogInput[] = []
  private timer: ReturnType<typeof setTimeout> | null = null
  private flushing = false
  private exitHooksBound = false

  /** 内存缓存，避免每请求读库 */
  private scopes: LogScope[] = [...DEFAULT_LOG_SCOPES]
  private scopesLoaded = false
  private scopesLoading: Promise<void> | null = null

  /** 是否应写入（同步，用缓存；首次异步预热） */
  shouldRecord(input: {
    method: string
    path: string
    status: number
    bizCode: number | null
    isPublic?: boolean
    unhandledError?: boolean
  }): boolean {
    void this.ensureScopes()
    return shouldRecordByScope(this.scopes, input)
  }

  async getScopes(): Promise<LogScope[]> {
    await this.ensureScopes()
    return [...this.scopes]
  }

  async setScopes(scopes: LogScope[]): Promise<LogScope[]> {
    const next = normalizeLogScopes(scopes)
    await this.conf.setValue(LOG_SCOPE_KEY, JSON.stringify(next))
    this.scopes = next
    this.scopesLoaded = true
    return [...this.scopes]
  }

  scopeOptions() {
    return LOG_SCOPE_OPTIONS
  }

  private async ensureScopes(): Promise<void> {
    if (this.scopesLoaded) return
    if (this.scopesLoading) return this.scopesLoading
    this.scopesLoading = (async () => {
      try {
        const raw = await this.conf.getValue(LOG_SCOPE_KEY)
        if (raw) {
          try {
            this.scopes = normalizeLogScopes(JSON.parse(raw))
          } catch {
            this.scopes = [...DEFAULT_LOG_SCOPES]
          }
        } else {
          this.scopes = [...DEFAULT_LOG_SCOPES]
        }
        this.scopesLoaded = true
      } catch (err) {
        console.error('[RequestLog] load scope failed', err)
        this.scopes = [...DEFAULT_LOG_SCOPES]
        this.scopesLoaded = true
      } finally {
        this.scopesLoading = null
      }
    })()
    return this.scopesLoading
  }

  /** 入队；满 50 或最多 5s 后批量写入（不阻塞请求） */
  record(input: RequestLogInput): void {
    this.bindExitHooks()
    this.buffer.push(input)
    if (this.buffer.length >= FLUSH_SIZE) {
      void this.flush()
      return
    }
    if (!this.timer) {
      this.timer = setTimeout(() => {
        this.timer = null
        void this.flush()
      }, FLUSH_MS)
    }
  }

  /** 刷出缓冲区；退出钩子 / 满批 / 定时器共用 */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (this.flushing || !this.buffer.length) return

    this.flushing = true
    const batch = this.buffer.splice(0, this.buffer.length)
    try {
      await this.logRepo.create(
        batch.map((input) => ({
          userId: input.userId || null,
          side: input.side,
          ip: input.ip || null,
          method: input.method,
          action: input.action,
          logType: input.logType || null,
          params: input.params ?? null,
          response: input.response ?? null,
          duration: input.duration,
          status: input.status ?? null,
        })),
      )
    } catch (err) {
      this.buffer.unshift(...batch)
      console.error('[RequestLog] batch flush failed', err)
    } finally {
      this.flushing = false
      if (this.buffer.length >= FLUSH_SIZE) {
        void this.flush()
      } else if (this.buffer.length && !this.timer) {
        this.timer = setTimeout(() => {
          this.timer = null
          void this.flush()
        }, FLUSH_MS)
      }
    }
  }

  private bindExitHooks() {
    if (this.exitHooksBound) return
    this.exitHooksBound = true
    process.on('beforeExit', () => {
      void this.flush()
    })
  }

  async getKeepDays(): Promise<number> {
    const raw = await this.conf.getValue(LOG_KEEP_KEY)
    const n = Number(raw)
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_KEEP_DAYS
  }

  async setKeepDays(days: number): Promise<void> {
    const n = Math.max(0, Math.floor(days))
    await this.conf.setValue(LOG_KEEP_KEY, String(n))
  }

  /**
   * 清理过期请求日志
   * - 无参 / 非 all：按 logKeep 天数删除（系统内置每天 02:00 调用）
   * - params.all / true：清空全部（管理端「清空」）
   */
  async clear(params?: { all?: boolean } | boolean): Promise<void> {
    const isAll = typeof params === 'boolean' ? params : Boolean(params?.all)
    if (isAll) {
      await this.logRepo.forceDelete(isNotNull(baseLog.id))
      return
    }
    const keepDay = await this.getKeepDays()
    if (!keepDay) {
      await this.logRepo.forceDelete(isNotNull(baseLog.id))
      return
    }
    const before = new Date()
    before.setHours(0, 0, 0, 0)
    before.setDate(before.getDate() - keepDay)
    await this.logRepo.forceDelete(lt(baseLog.createTime, before))
  }
}
