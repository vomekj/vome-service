import type { CrudModifyType } from '@core/server'
import { and, asc, eq, isNull } from 'drizzle-orm'
import {
  BaseService,
  Inject,
  InjectRepository,
  Provide,
  getSourceLang,
  type Repository,
} from '@core/server'
import { PluginInfoService } from '../../base/service/plugin'
import {
  transferRemoteImage,
  type UploadDownPlugin,
} from '../../../utils/compress-transfer-image'
import { ensureFlagFromCountryCode } from '../lib/country-flag'
import { i18nLang } from '../entity/lang'

const FLAG_PREFIX = 'app/public/i18n/lang'

type UploadPlugin = UploadDownPlugin

function trimStr(raw: unknown) {
  return String(raw ?? '').trim()
}

/** 语种 code 取区域段作国家码：`en-US` → `US`；无区域则整段 */
function countryCodeFromLangCode(code: unknown): string {
  const raw = trimStr(code).replace(/_/g, '-')
  const parts = raw.split('-').filter(Boolean)
  if (parts.length >= 2) return parts[parts.length - 1]!
  return parts[0] || ''
}

@Provide()
export class I18nLangService extends BaseService {
  @InjectRepository(i18nLang)
  langRepo: Repository<typeof i18nLang>

  @Inject()
  plugin: PluginInfoService

  /** 外链 / Flagcdn → 压缩转存本桶 */
  private async transferFlagImage(raw: string): Promise<string> {
    return transferRemoteImage({
      getPlugin: async () =>
        (await this.plugin.getInstance('upload')) as UploadPlugin,
      raw,
      prefixPath: FLAG_PREFIX,
      failLabel: '语种国旗转存',
    })
  }

  private async fillFlagFromCode(
    data: Record<string, unknown>,
    flagRaw: unknown,
  ) {
    data.flag = await ensureFlagFromCountryCode({
      countryCode: countryCodeFromLangCode(data.code),
      flag: flagRaw,
      transfer: (url) => this.transferFlagImage(url),
    })
  }

  private async prepareLang(
    data: Record<string, unknown>,
    type: 'add' | 'update',
  ) {
    if (data.nameZh != null) data.nameZh = trimStr(data.nameZh)
    // 行内开关等局部更新只带 id+status，勿强校验 code/name
    if (type === 'update') {
      const hasCode = data.code !== undefined
      const hasName = data.name !== undefined
      const hasFlag = data.flag !== undefined
      if (!hasCode && !hasName && !hasFlag) return

      if (hasCode) {
        data.code = trimStr(data.code)
      }
      if (hasName) {
        data.name = trimStr(data.name)
      }
      if (hasFlag) {
        const flag = trimStr(data.flag)
        if (flag) {
          data.flag = await this.transferFlagImage(flag)
        } else if (hasCode && trimStr(data.code)) {
          await this.fillFlagFromCode(data, '')
        } else {
          data.flag = ''
        }
      }
      return
    }

    if (data.code != null) data.code = trimStr(data.code)
    if (data.name != null) data.name = trimStr(data.name)
    await this.fillFlagFromCode(data, data.flag)
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

  /** 是否已安装并启用存储桶（upload）插件，国旗转存依赖它 */
  async hasUploadPlugin() {
    try {
      return await this.plugin.checkStatus('upload')
    } catch {
      return false
    }
  }

  /**
   * 补全 flag 为空的语种国旗（种子入库不走 modifyBefore）。
   * 无 upload 插件时跳过并打错误日志。插件就绪后由 Module.bootstrap 调用。
   */
  async ensureEmptyFlags() {
    if (!(await this.hasUploadPlugin())) {
      console.error(
        '[i18n] 语种国旗补全跳过：请先安装并启用存储桶（upload）插件',
      )
      return
    }
    try {
      await this.plugin.getInstance('upload')
    } catch {
      console.error(
        '[i18n] 语种国旗补全跳过：请先安装并启用存储桶（upload）插件',
      )
      return
    }
    const rows = await this.langRepo.find(
      and(eq(i18nLang.flag, ''), isNull(i18nLang.deleteTime)),
    )
    if (!rows.length) return
    let ok = 0
    for (const row of rows) {
      const id = Number(row.id)
      const code = trimStr(row.code)
      if (!Number.isFinite(id) || id <= 0 || !code) continue
      try {
        const data: Record<string, unknown> = { code, flag: '' }
        await this.fillFlagFromCode(data, '')
        const flag = trimStr(data.flag)
        if (!flag) continue
        await this.langRepo.update([{ id, flag }])
        ok += 1
      } catch (err) {
        console.warn(
          `[i18n] 语种国旗失败 ${code}:`,
          err instanceof Error ? err.message : err,
        )
      }
    }
    if (ok > 0) console.info(`[i18n] 已补全 ${ok} 条语种国旗`)
  }

  /** 启用中语种（按语种编码排序；可排除 system.lang 源语言；name 为配置原文） */
  async listEnabled(opts?: { excludeSource?: boolean }) {
    const rows = await this.langRepo.find(
      and(eq(i18nLang.status, 1), isNull(i18nLang.deleteTime)),
      { orderBy: [asc(i18nLang.code)] },
    )
    if (!opts?.excludeSource) return rows
    const src = getSourceLang()
    if (!src) return rows
    return rows.filter((r) => String(r.code || '').trim() !== src)
  }
}
