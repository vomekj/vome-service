import { and, eq, sql } from 'drizzle-orm'
import {
  BaseService,
  CommException,
  Context,
  InjectRepository,
  isTenantEnabled,
  normalizeHost,
  noTenant,
  Provide,
  type Repository,
} from '/#/server'
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

  async modifyBefore(data: any, type: 'add' | 'update' | 'delete') {
    if (type === 'add' || type === 'update') {
      if (typeof data?.domains === 'string') {
        data.domains = data.domains.split(/[,，\s]+/).filter(Boolean)
      }
      if (data?.domains != null) {
        data.domains = this.normalizeDomains(data.domains)
      }
      if (type === 'add' && data?.code) {
        data.code = String(data.code).trim().toLowerCase()
      }
      if (data?.status != null && data.status !== '') {
        data.status = Number(data.status)
      }
    }
  }

  /** 按 Host 解析启用中的租户 */
  async findByHost(host: string | null | undefined) {
    const h = normalizeHost(host)
    if (!h) return undefined
    return noTenant(async () => {
      const rows = await this.tenantRepo.find(
        and(eq(baseTenant.status, 1), sql`${baseTenant.deletedAt} is null`),
      )
      return rows.find((row) =>
        (row.domains ?? []).some((d) => normalizeHost(d) === h),
      )
    })
  }

  /** 从当前请求 Context.host 解析租户 ID（仅 tenant 开启时） */
  async resolveTenantIdFromRequest(): Promise<number | undefined> {
    if (!isTenantEnabled()) return undefined
    const host = Context.get()?.host as string | undefined
    const tenant = await this.findByHost(host)
    if (!tenant) {
      throw new CommException('未识别的租户域名，请使用已绑定域名访问')
    }
    return tenant.id
  }

  async listEnabled() {
    return noTenant(() =>
      this.tenantRepo.find(
        and(eq(baseTenant.status, 1), sql`${baseTenant.deletedAt} is null`),
      ),
    )
  }
}
