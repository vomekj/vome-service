import type { CrudModifyType } from '@core/server'
import { and, asc, eq, getTableName, isNull, ne } from 'drizzle-orm'
import {
  BaseService,
  CommException,
  Context,
  Inject,
  InjectRepository,
  Provide,
  applyDataI18n,
  getSourceLang,
  type Repository,
} from '@core/server'
import { PluginInfoService } from '../../base/service/plugin'
import {
  transferRemoteImage,
  type UploadDownPlugin,
} from '../../../utils/transfer-remote-image'
import { i18nLang } from '../entity/lang'

const FLAG_PREFIX = 'app/public/i18n/lang'

type UploadPlugin = UploadDownPlugin

function normalizeTenantId(raw: unknown): number {
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : 0
}

function trimStr(raw: unknown) {
  return String(raw ?? '').trim()
}

@Provide()
export class I18nLangService extends BaseService {
  @InjectRepository(i18nLang)
  langRepo: Repository<typeof i18nLang>

  @Inject()
  plugin: PluginInfoService

  /** 外链图片转存到本桶；非 http 原样返回 */
  private async transferFlagImage(raw: string): Promise<string> {
    return transferRemoteImage({
      getPlugin: async () =>
        (await this.plugin.getInstance('upload')) as UploadPlugin,
      raw,
      prefixPath: FLAG_PREFIX,
    })
  }

  private async assertCodeUnique(code: string, id?: number) {
    const tenantId = normalizeTenantId(Context.get()?.tenantId)
    const conds = [
      eq(i18nLang.code, code),
      eq(i18nLang.tenantId, tenantId),
      isNull(i18nLang.deleteTime),
    ]
    if (id != null) conds.push(ne(i18nLang.id, id))
    const [hit] = await this.langRepo.find(and(...conds))
    if (hit) throw new CommException(`语种编码「${code}」已存在`)
  }

  private async prepareLang(
    data: Record<string, unknown>,
    type: 'add' | 'update',
  ) {
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
        const code = trimStr(data.code)
        data.code = code
        await this.assertCodeUnique(code, Number(data.id))
      }
      if (hasName) {
        data.name = trimStr(data.name)
      }
      if (hasFlag) {
        let flag = trimStr(data.flag)
        if (flag) flag = await this.transferFlagImage(flag)
        data.flag = flag
      }
      return
    }

    if (data.code != null) data.code = trimStr(data.code)
    if (data.name != null) data.name = trimStr(data.name)
    if (data.flag != null) {
      let flag = trimStr(data.flag)
      if (flag) flag = await this.transferFlagImage(flag)
      data.flag = flag
    } else {
      data.flag = ''
    }
    await this.assertCodeUnique(String(data.code ?? ''))
  }

  async modifyBefore(data: unknown, type: CrudModifyType) {
    if (type !== 'add' && type !== 'update') return
    const rows = Array.isArray(data) ? data : [data]
    for (const raw of rows) {
      if (raw == null || typeof raw !== 'object') continue
      await this.prepareLang(
        raw as Record<string, unknown>,
        type as 'add' | 'update',
      )
    }
  }

  /** 启用中语种（按语种编码排序；可排除 system.lang 源语言；name 走 dataI18n） */
  async listEnabled(opts?: { excludeSource?: boolean }) {
    const rows = await this.langRepo.find(
      and(eq(i18nLang.status, 1), isNull(i18nLang.deleteTime)),
      { orderBy: [asc(i18nLang.code)] },
    )
    let list = rows
    if (opts?.excludeSource) {
      const src = getSourceLang()
      if (src) {
        list = rows.filter((r) => String(r.code || '').trim() !== src)
      }
    }
    return (await applyDataI18n(list, getTableName(i18nLang))) as typeof rows
  }
}
