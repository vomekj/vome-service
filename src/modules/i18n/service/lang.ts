import { and, asc, eq, isNull, ne } from 'drizzle-orm'
import {
  BaseService,
  CommException,
  Context,
  InjectRepository,
  Provide,
  type Repository,
} from '@core/server'
import { i18nLang } from '../entity/lang'

function normalizeTenantId(raw: unknown): number {
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : 0
}

@Provide()
export class I18nLangService extends BaseService {
  @InjectRepository(i18nLang)
  langRepo: Repository<typeof i18nLang>

  private async assertCodeUnique(code: string, id?: number) {
    const tenantId = normalizeTenantId(Context.get()?.tenantId)
    const conds = [
      eq(i18nLang.code, code),
      eq(i18nLang.tenantId, tenantId),
      isNull(i18nLang.deletedTime),
    ]
    if (id != null) conds.push(ne(i18nLang.id, id))
    const [hit] = await this.langRepo.find(and(...conds))
    if (hit) throw new CommException(`语种编码「${code}」已存在`)
  }

  private async prepareLang(data: Record<string, unknown>, type: 'add' | 'update') {
    data.tenantId = normalizeTenantId(
      data.tenantId ?? Context.get()?.tenantId,
    )

    // 行内开关等局部更新只带 id+status，勿强校验 code/name
    if (type === 'update') {
      const hasCode = data.code !== undefined
      const hasName = data.name !== undefined
      const hasFlag = data.flag !== undefined
      if (!hasCode && !hasName && !hasFlag) return

      if (hasCode) {
        const code = String(data.code ?? '').trim()
        data.code = code
        await this.assertCodeUnique(code, Number(data.id))
      }
      if (hasName) {
        data.name = String(data.name ?? '').trim()
      }
      if (hasFlag) {
        data.flag = String(data.flag ?? '').trim() || '🏳️'
      }
      return
    }

    if (data.code != null) data.code = String(data.code).trim()
    if (data.name != null) data.name = String(data.name).trim()
    data.flag = String(data.flag ?? '').trim() || '🏳️'
    await this.assertCodeUnique(String(data.code ?? ''))
  }

  override async add(data: unknown, options?: Parameters<BaseService['add']>[1]) {
    const rows = Array.isArray(data) ? data : [data]
    for (const raw of rows) {
      if (raw != null && typeof raw === 'object') {
        await this.prepareLang(raw as Record<string, unknown>, 'add')
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
        await this.prepareLang(data as Record<string, unknown>, 'update')
      }
      return super.update(whereOrData as never, data)
    }
    const rows = Array.isArray(whereOrData)
      ? whereOrData
      : [whereOrData as Record<string, unknown>]
    for (const row of rows) {
      await this.prepareLang(row, 'update')
    }
    return super.update(whereOrData)
  }

  /** 启用语种；按语种 id 升序 */
  async listEnabled() {
    return this.langRepo.find(
      and(eq(i18nLang.status, 1), isNull(i18nLang.deletedTime)),
      { orderBy: [asc(i18nLang.id)] },
    )
  }
}
