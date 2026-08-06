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
      isNull(i18nLang.deletedAt),
    ]
    if (id != null) conds.push(ne(i18nLang.id, id))
    const [hit] = await this.langRepo.find(and(...conds))
    if (hit) throw new CommException(`语种编码「${code}」已存在`)
  }

  async modifyBefore(
    data: Record<string, unknown>,
    type: 'add' | 'update' | 'delete',
  ) {
    if (type !== 'add' && type !== 'update') return
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
        if (!code) throw new CommException('语种编码不能为空')
        data.code = code
        await this.assertCodeUnique(code, Number(data.id))
      }
      if (hasName) {
        const name = String(data.name ?? '').trim()
        if (!name) throw new CommException('语言名称不能为空')
        data.name = name
      }
      if (hasFlag) {
        data.flag = String(data.flag ?? '').trim() || '🏳️'
      }
      return
    }

    const code = String(data.code ?? '').trim()
    const name = String(data.name ?? '').trim()
    const flag = String(data.flag ?? '').trim() || '🏳️'
    if (!code) throw new CommException('语种编码不能为空')
    if (!name) throw new CommException('语言名称不能为空')
    data.code = code
    data.name = name
    data.flag = flag
    await this.assertCodeUnique(code)
  }

  /** 启用语种；按语种 id 升序 */
  async listEnabled() {
    return this.langRepo.find(
      and(eq(i18nLang.status, 1), isNull(i18nLang.deletedAt)),
      { orderBy: [asc(i18nLang.id)] },
    )
  }
}
