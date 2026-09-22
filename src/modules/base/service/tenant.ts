import type { CrudModifyType } from '@core/server'
import { and, eq, sql } from 'drizzle-orm'
import {
  BaseService,
  CommException,
  Context,
  InjectRepository,
  Ioc,
  isTenantEnabled,
  normalizeHost,
  Provide,
  registerTenantHostResolver,
  type Repository,
} from '@core/server'
import { baseTenant } from '../entity/tenant'

@Provide()
export class TenantService extends BaseService {
  @InjectRepository(baseTenant)
  tenantRepo: Repository<typeof baseTenant>

  /** 规范化域名列表 */
  normalizeDomains(domains: unknown): string[] {
    if (!Array.isArray(domains)) return []
    const out = new Set<string>()
    for (const d of domains) {
      const n = normalizeHost(String(d ?? ''))
      if (n) out.add(n)
    }
    return [...out]
  }

  private prepareTenant(data: Record<string, unknown>, type: 'add' | 'update') {
    if (typeof data.domains === 'string') {
      data.domains = data.domains.split(/[,，\s]+/).filter(Boolean)
    }
    if (data.domains != null) {
      data.domains = this.normalizeDomains(data.domains)
    }
    if (type === 'add' && data.code) {
      data.code = String(data.code).trim().toLowerCase()
    }
    if (data.status != null && data.status !== '') {
      data.status = Number(data.status)
    }
  }

  async modifyBefore(data: unknown, type: CrudModifyType) {
    if (type !== 'add' && type !== 'update') return
    const rows = Array.isArray(data) ? data : [data]
    for (const raw of rows) {
      if (raw == null || typeof raw !== 'object') continue
      await this.prepareTenant(raw as Record<string, unknown>, type as 'add' | 'update')
    }
  }

  async modifyAfter(data: unknown, type: CrudModifyType) {
    if (type === 'delete') {
      await this.dropTenantCache(data)
      return
    }
    if (type === 'add' || type === 'update') {
      await this.cacheSet('base_tenant', data)
    }
  }

  /** 回收站恢复不走 modifyAfter，整桶失效后重新灌满 */
  async restore(whereOrIds: Parameters<BaseService['restore']>[0]) {
    const result = await super.restore(whereOrIds)
    await this.cacheDel('base_tenant')
    await this.init()
    return result
  }

  private async loadEnabled() {
    return this.tenantRepo.find(
      and(eq(baseTenant.status, 1), sql`${baseTenant.deleteTime} is null`),
    )
  }

  /** 启动灌租户域名缓存 */
  override async init() {
    await this.cacheSet('base_tenant', (await this.loadEnabled()) ?? [])
  }

  private async dropTenantCache(data: unknown) {
    const ids = (Array.isArray(data) ? data : [data])
      .map((item) => {
        if (typeof item === 'number' || typeof item === 'string') return Number(item)
        if (item && typeof item === 'object' && 'id' in item) return Number((item as { id: unknown }).id)
        return NaN
      })
      .filter((id) => Number.isFinite(id))
    if (ids.length) {
      await this.cacheDel('base_tenant', ids)
      return
    }
    await this.cacheDel('base_tenant')
    await this.init()
  }

  /** 进程 Map 命中则不查库 */
  async findIdByHost(host: string | null | undefined): Promise<number | undefined> {
    const h = normalizeHost(host)
    if (!h) return undefined
    const rows = await this.cacheGet('base_tenant', () => this.loadEnabled())
    for (const row of rows) {
      if (row.status !== 1) continue
      for (const domain of row.domains ?? []) {
        if (normalizeHost(domain) === h) return row.id
      }
    }
    return undefined
  }

  /** 按 Host 解析启用中的租户 */
  async findByHost(host: string | null | undefined) {
    const id = await this.findIdByHost(host)
    if (id == null) return undefined
    return { id }
  }

  /** 从当前请求 Context.host 解析租户 ID（仅 tenant 开启时） */
  async resolveTenantIdFromRequest(): Promise<number | undefined> {
    if (!isTenantEnabled()) return undefined
    const host = Context.get()?.host as string | undefined
    const id = await this.findIdByHost(host)
    if (id == null) {
      throw new CommException('未识别的租户域名，请使用已绑定域名访问')
    }
    return id
  }

  async listEnabled() {
    return this.loadEnabled()
  }
}

registerTenantHostResolver(async (host) => {
  return Ioc.get(TenantService).findIdByHost(host)
})
