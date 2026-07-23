import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { and, asc, desc, eq, getTableName, isNull, ne } from 'drizzle-orm'
import {
  BaseService,
  CommException,
  Context,
  Inject,
  InjectRepository,
  Provide,
  VomeConfig,
  pModulePath,
  pModulesPath,
  listColumnCommentTables,
  getColumnComments,
  type Repository,
} from '/#/server'
import { AiGateway } from '../../ai/service/gateway'
import { aiModel } from '../../ai/entity/model'
import { baseMenu } from '../../base/entity/menu'
import { basePluginInfo } from '../../base/entity/plugin-info'
import { i18nLang } from '../entity/lang'
import { i18nPack } from '../entity/pack'
import {
  extractJsonObject,
  flattenLocale,
  hashLocaleJson,
  unflattenLocale,
} from '../lib/locale-json'

/** 宿主端标识（DB scopeKey） */
export const HOST_SCOPE_KEYS = ['admin', 'web', 'uniapp'] as const
export type HostScopeKey = (typeof HOST_SCOPE_KEYS)[number]

/** 需 HTTP 拉取的 C 端（目录名与 scopeKey 脱钩） */
const FRONT_SCOPE_KEYS = ['web', 'uniapp'] as const
type FrontScopeKey = (typeof FRONT_SCOPE_KEYS)[number]

/** web / uniapp：HTTP 路径（源文件均在各自 src/locales/，由 Vite 挂出） */
const FRONT_LOCALE_PATH: Record<FrontScopeKey, string> = {
  web: '/locales/zh-CN.json',
  uniapp: '/static/locales/zh-CN.json',
}

function frontLocaleUrl(scopeKey: FrontScopeKey): string | null {
  const origin = localeOriginOf(scopeKey)
  if (!origin) return null
  return `${origin}${FRONT_LOCALE_PATH[scopeKey]}`
}

export function isHostScopeKey(key: string): key is HostScopeKey {
  return (HOST_SCOPE_KEYS as readonly string[]).includes(key)
}

function isFrontScopeKey(key: string): key is FrontScopeKey {
  return (FRONT_SCOPE_KEYS as readonly string[]).includes(key)
}

/** 与 EPS 同开关：关闭则不同步前端语言包 */
function isFrontLocaleSyncEnabled() {
  return Boolean((VomeConfig.vome as { eps?: boolean } | undefined)?.eps)
}

function localeOriginOf(scopeKey: FrontScopeKey): string {
  const origins = (
    VomeConfig.system as
      | { localeOrigins?: Record<string, string> }
      | undefined
  )?.localeOrigins
  return String(origins?.[scopeKey] || '')
    .trim()
    .replace(/\/$/, '')
}

/** admin 磁盘源包候选（cwd=service → ../admin） */
function adminZhCandidates(): string[] {
  const cwd = process.cwd()
  return [
    join(cwd, '..', 'admin', 'locales', 'zh-CN.json'),
    join(cwd, 'admin', 'locales', 'zh-CN.json'),
    join(cwd, 'locales', 'zh-CN.json'),
  ]
}

function normalizeTenantId(raw: unknown): number {
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : 0
}

function normalizeScope(
  scopeType?: string,
  scopeKey?: string,
): { scopeType: 'host' | 'plugin'; scopeKey: string } {
  const type = String(scopeType || 'host').trim() === 'plugin' ? 'plugin' : 'host'
  if (type === 'host') {
    const key = String(scopeKey || 'admin').trim() || 'admin'
    if (!isHostScopeKey(key)) {
      throw new CommException(
        `宿主语言包标识须为 ${HOST_SCOPE_KEYS.join(' / ')}`,
      )
    }
    return { scopeType: 'host', scopeKey: key }
  }
  const key = String(scopeKey || '').trim()
  if (!key) {
    throw new CommException('插件语言包须指定 scopeKey（插件 key）')
  }
  return { scopeType: 'plugin', scopeKey: key }
}

@Provide()
export class I18nPackService extends BaseService {
  @InjectRepository(i18nPack)
  packRepo: Repository<typeof i18nPack>

  @InjectRepository(i18nLang)
  langRepo: Repository<typeof i18nLang>

  @InjectRepository(baseMenu)
  menuRepo: Repository<typeof baseMenu>

  @InjectRepository(aiModel)
  modelRepo: Repository<typeof aiModel>

  @InjectRepository(basePluginInfo)
  pluginRepo: Repository<typeof basePluginInfo>

  @Inject()
  aiGateway: AiGateway

  async modifyBefore(
    data: Record<string, unknown>,
    type: 'add' | 'update' | 'delete',
  ) {
    if (type !== 'add' && type !== 'update') return
    data.tenantId = normalizeTenantId(
      data.tenantId ?? Context.get()?.tenantId,
    )
    const langCode = String(data.langCode ?? '').trim()
    if (!langCode) throw new CommException('语种编码不能为空')
    data.langCode = langCode
    const scope = normalizeScope(
      String(data.scopeType ?? 'host'),
      String(data.scopeKey ?? ''),
    )
    data.scopeType = scope.scopeType
    data.scopeKey = scope.scopeKey

    let packJson = data.packJson
    if (typeof packJson === 'string') {
      try {
        packJson = JSON.parse(packJson)
      } catch {
        throw new CommException('语言包 JSON 格式错误')
      }
    }
    if (!packJson || typeof packJson !== 'object' || Array.isArray(packJson)) {
      throw new CommException('语言包须为 JSON 对象')
    }
    data.packJson = packJson
    data.sourceHash = hashLocaleJson(packJson as Record<string, unknown>)

    if (type === 'add') {
      data.version = Number(data.version) > 0 ? Number(data.version) : 1
      await this.assertUnique(
        langCode,
        scope.scopeType,
        scope.scopeKey,
      )
    } else {
      const id = Number(data.id)
      const [old] = await this.packRepo.find(
        and(eq(i18nPack.id, id), isNull(i18nPack.deletedAt)),
      )
      if (old) {
        data.version = Number(old.version || 1) + 1
      }
      await this.assertUnique(
        langCode,
        scope.scopeType,
        scope.scopeKey,
        id,
      )
    }
  }

  /**
   * 新增：若同唯一键存在软删行，则恢复并更新（唯一索引含软删行）
   */
  async add(data: unknown) {
    const payload =
      data != null && typeof data === 'object'
        ? { ...(data as Record<string, unknown>) }
        : ({} as Record<string, unknown>)
    await this.modifyBefore(payload, 'add')

    const tenantId = normalizeTenantId(
      payload.tenantId ?? Context.get()?.tenantId,
    )
    const langCode = String(payload.langCode || '')
    const scopeType = String(payload.scopeType || 'host')
    const scopeKey = String(payload.scopeKey || 'admin')

    const [existing] = await this.packRepo.find(
      and(
        eq(i18nPack.tenantId, tenantId),
        eq(i18nPack.langCode, langCode),
        eq(i18nPack.scopeType, scopeType),
        eq(i18nPack.scopeKey, scopeKey),
      ),
      { withTrashed: true },
    )

    if (existing?.deletedAt) {
      await this.packRepo.restore(eq(i18nPack.id, existing.id))
      await this.packRepo.update(eq(i18nPack.id, existing.id), {
        packJson: payload.packJson,
        version: Number(existing.version || 1) + 1,
        sourceHash: payload.sourceHash,
        ...(payload.remark !== undefined ? { remark: payload.remark } : {}),
      })
      const [fresh] = await this.packRepo.find(eq(i18nPack.id, existing.id))
      await this.modifyAfter(fresh ?? existing, 'add')
      return fresh
    }

    if (existing) {
      throw new CommException(
        `语言包已存在：${scopeType}/${scopeKey}/${langCode}`,
      )
    }

    const result = await this.packRepo.create(payload)
    await this.modifyAfter(result ?? payload, 'add')
    return result
  }

  private async assertUnique(
    langCode: string,
    scopeType: string,
    scopeKey: string,
    id?: number,
  ) {
    const tenantId = normalizeTenantId(Context.get()?.tenantId)
    const conds = [
      eq(i18nPack.tenantId, tenantId),
      eq(i18nPack.langCode, langCode),
      eq(i18nPack.scopeType, scopeType),
      eq(i18nPack.scopeKey, scopeKey),
      isNull(i18nPack.deletedAt),
    ]
    if (id != null) conds.push(ne(i18nPack.id, id))
    const [hit] = await this.packRepo.find(and(...conds))
    if (hit) {
      throw new CommException(
        `语言包已存在：${scopeType}/${scopeKey}/${langCode}`,
      )
    }
  }

  /**
   * 插件语言包标识可为「插件名称」或 module.key（兼容旧数据 / 微应用按 key 拉取）
   */
  private async pluginScopeKeyCandidates(raw: string): Promise<string[]> {
    const s = String(raw || '').trim()
    if (!s) return []
    const out = [s]
    const [byKey] = await this.pluginRepo.find(
      and(eq(basePluginInfo.keyName, s), isNull(basePluginInfo.deletedAt)),
    )
    const name = String(byKey?.name || '').trim()
    if (name && name !== s) out.push(name)
    const [byName] = await this.pluginRepo.find(
      and(eq(basePluginInfo.name, s), isNull(basePluginInfo.deletedAt)),
    )
    const key = String(byName?.keyName || '').trim()
    if (key && key !== s) out.push(key)
    return [...new Set(out)]
  }

  /** 名称 / key → 磁盘用的 module.key */
  private async resolvePluginDiskKey(raw: string): Promise<string> {
    const s = String(raw || '').trim()
    if (!s) return s
    const [byKey] = await this.pluginRepo.find(
      and(eq(basePluginInfo.keyName, s), isNull(basePluginInfo.deletedAt)),
    )
    if (byKey) return s
    const [byName] = await this.pluginRepo.find(
      and(eq(basePluginInfo.name, s), isNull(basePluginInfo.deletedAt)),
    )
    const key = String(byName?.keyName || '').trim()
    return key || s
  }

  async findPack(opts: {
    langCode: string
    scopeType?: string
    scopeKey?: string
  }) {
    const scope = normalizeScope(opts.scopeType, opts.scopeKey)
    const tenantId = normalizeTenantId(Context.get()?.tenantId)
    const scopeKeys =
      scope.scopeType === 'plugin'
        ? await this.pluginScopeKeyCandidates(scope.scopeKey)
        : [scope.scopeKey]
    for (const scopeKey of scopeKeys) {
      const [row] = await this.packRepo.find(
        and(
          eq(i18nPack.tenantId, tenantId),
          eq(i18nPack.langCode, opts.langCode),
          eq(i18nPack.scopeType, scope.scopeType),
          eq(i18nPack.scopeKey, scopeKey),
          isNull(i18nPack.deletedAt),
        ),
      )
      if (row) return row
    }
    return null
  }

  /** 运行时拉取（无包返回 null） */
  async getActivePack(opts: {
    langCode: string
    scopeType?: string
    scopeKey?: string
  }) {
    const row = await this.findPack(opts)
    if (!row) return null
    return {
      id: row.id,
      langCode: row.langCode,
      scopeType: row.scopeType,
      scopeKey: row.scopeKey,
      version: row.version,
      packJson: row.packJson ?? {},
      updateTime: row.updateTime,
    }
  }

  /**
   * 顶栏可切换语种：仅返回指定宿主端已生成的语言包
   * name/flag 取语种配置；排序按语种表 id 升序
   */
  async listHostLocales(scopeKey: string = 'admin') {
    const scope = normalizeScope('host', scopeKey)
    const rows = await this.packRepo.find(
      and(
        eq(i18nPack.scopeType, 'host'),
        eq(i18nPack.scopeKey, scope.scopeKey),
        isNull(i18nPack.deletedAt),
      ),
    )
    const codeSet = new Set<string>()
    for (const row of rows ?? []) {
      const code = String(row.langCode || '').trim()
      if (code) codeSet.add(code)
    }
    if (!codeSet.size) {
      return [{ code: 'zh-CN', name: '简体中文', flag: '🇨🇳' }]
    }
    const langRows = await this.langRepo.find(isNull(i18nLang.deletedAt), {
      orderBy: [asc(i18nLang.id)],
    })
    const out: Array<{ code: string; name: string; flag: string }> = []
    const used = new Set<string>()
    for (const l of langRows ?? []) {
      const code = String(l.code || '').trim()
      if (!code || !codeSet.has(code) || used.has(code)) continue
      used.add(code)
      out.push({
        code,
        name: String(l.name || code),
        flag: String(l.flag || '🏳️'),
      })
    }
    // 有包但语种配置已删：按编码补在末尾
    for (const code of codeSet) {
      if (used.has(code)) continue
      out.push({ code, name: code, flag: '🏳️' })
    }
    return out
  }

  /** 菜单可见节点写入 menu.{id} */
  async collectMenuLabels(): Promise<Record<string, string>> {
    const rows = await this.menuRepo.find(isNull(baseMenu.deletedAt), {
      orderBy: [asc(baseMenu.orderNum), asc(baseMenu.id)],
    })
    const out: Record<string, string> = {}
    for (const row of rows) {
      if (row.type === 2) continue
      if (!row.isShow && row.type === 1) {
        /* 隐藏页仍可译，便于 tags */
      }
      out[String(row.id)] = row.name
    }
    return out
  }

  /**
   * EPS/实体列注释 → field.{table}.{prop}，供筛选占位符等动态文案翻译
   */
  collectFieldLabels(): Record<string, Record<string, string>> {
    const out: Record<string, Record<string, string>> = {}
    try {
      for (const table of listColumnCommentTables()) {
        let tableName = ''
        try {
          tableName = getTableName(table as never)
        } catch {
          continue
        }
        if (!tableName) continue
        const comments = getColumnComments(table)
        const bag: Record<string, string> = {}
        for (const [prop, text] of Object.entries(comments)) {
          const label = String(text || '').trim()
          if (!prop || !label) continue
          bag[prop] = label
        }
        if (Object.keys(bag).length) out[tableName] = bag
      }
    } catch {
      /* schema 未就绪时忽略 */
    }
    return out
  }

  /**
   * 读宿主原始语言包
   * - admin：磁盘 admin/locales/zh-CN.json
   * - web / uniapp：HTTP GET {localeOrigins[scope]} + 路径（web=/locales/…，uni=/static/locales/…；需 vome.eps）
   *   源文件均在各自 src/locales/（Vite 挂出）
   */
  async readHostSource(scopeKey: HostScopeKey = 'admin'): Promise<{
    path: string | null
    packJson: Record<string, unknown> | null
  }> {
    if (isFrontScopeKey(scopeKey)) {
      return this.readFrontHostSource(scopeKey)
    }
    for (const file of adminZhCandidates()) {
      if (!existsSync(file)) continue
      try {
        const raw = readFileSync(file, 'utf8')
        const parsed = JSON.parse(raw) as unknown
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new CommException(`宿主语言包格式错误: ${file}`)
        }
        return {
          path: file,
          packJson: parsed as Record<string, unknown>,
        }
      } catch (e) {
        if (e instanceof CommException) throw e
        throw new CommException(
          `读取宿主语言包失败: ${e instanceof Error ? e.message : String(e)}`,
        )
      }
    }
    return { path: null, packJson: null }
  }

  /** C 端：从配置的 origin 拉取静态语言包 */
  private async readFrontHostSource(scopeKey: FrontScopeKey): Promise<{
    path: string | null
    packJson: Record<string, unknown> | null
  }> {
    if (!isFrontLocaleSyncEnabled()) {
      return { path: null, packJson: null }
    }
    const url = frontLocaleUrl(scopeKey)
    if (!url) {
      return { path: null, packJson: null }
    }
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(8_000),
      })
      if (!res.ok) {
        throw new CommException(
          `拉取 ${scopeKey} 语言包失败 HTTP ${res.status}: ${url}`,
        )
      }
      const parsed = (await res.json()) as unknown
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new CommException(`宿主语言包格式错误: ${url}`)
      }
      return { path: url, packJson: parsed as Record<string, unknown> }
    } catch (e) {
      if (e instanceof CommException) throw e
      throw new CommException(
        `拉取 ${scopeKey} 语言包失败: ${e instanceof Error ? e.message : String(e)}（${url}）`,
      )
    }
  }

  /**
   * 宿主中文源模板
   * - admin：磁盘壳层 + 菜单 + EPS 字段注释
   * - web / uniapp：HTTP 源包
   */
  async buildHostSource(scopeKey: HostScopeKey = 'admin'): Promise<Record<string, unknown>> {
    const disk = await this.readHostSource(scopeKey)
    const existing = await this.findPack({
      langCode: 'zh-CN',
      scopeType: 'host',
      scopeKey,
    })
    const base = disk.packJson
      ? structuredClone(disk.packJson)
      : existing?.packJson && Object.keys(existing.packJson).length
        ? structuredClone(existing.packJson)
        : {}
    if (scopeKey !== 'admin') {
      return base as Record<string, unknown>
    }
    const menu = await this.collectMenuLabels()
    ;(base as { menu?: Record<string, string> }).menu = {
      ...((base as { menu?: Record<string, string> }).menu ?? {}),
      ...menu,
    }
    const field = this.collectFieldLabels()
    ;(base as { field?: Record<string, Record<string, string>> }).field = {
      ...((base as { field?: Record<string, Record<string, string>> }).field ??
        {}),
      ...field,
    }
    return base as Record<string, unknown>
  }

  /**
   * 读已安装插件原始语言包（磁盘 locales/zh-CN.json）
   * 兼容 front/full：根目录、web/、web-src/
   * @param pluginRef module.key 或插件名称
   */
  async readPluginSourceByRef(pluginRef: string): Promise<{
    pluginKey: string
    path: string | null
    packJson: Record<string, unknown> | null
  }> {
    const key = await this.resolvePluginDiskKey(pluginRef)
    return this.readPluginSource(key)
  }

  /**
   * 读已安装插件原始语言包（磁盘 locales/zh-CN.json）
   * 兼容 front/full：根目录、web/、web-src/
   */
  readPluginSource(pluginKey: string): {
    pluginKey: string
    path: string | null
    packJson: Record<string, unknown> | null
  } {
    const key = String(pluginKey || '').trim()
    if (!key) throw new CommException('pluginKey 不能为空')
    const root = pModulePath(key)
    const candidates = [
      join(root, 'locales', 'zh-CN.json'),
      join(root, 'web', 'locales', 'zh-CN.json'),
      join(root, 'web-src', 'locales', 'zh-CN.json'),
    ]
    for (const file of candidates) {
      if (!existsSync(file)) continue
      try {
        const raw = readFileSync(file, 'utf8')
        const parsed = JSON.parse(raw) as unknown
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new CommException(`插件语言包格式错误: ${file}`)
        }
        return {
          pluginKey: key,
          path: file,
          packJson: parsed as Record<string, unknown>,
        }
      } catch (e) {
        if (e instanceof CommException) throw e
        throw new CommException(
          `读取插件语言包失败: ${e instanceof Error ? e.message : String(e)}`,
        )
      }
    }
    return { pluginKey: key, path: null, packJson: null }
  }

  async resolveSourcePack(opts: {
    scopeType?: string
    scopeKey?: string
  }): Promise<Record<string, unknown>> {
    const scope = normalizeScope(opts.scopeType, opts.scopeKey)
    if (scope.scopeType === 'host') {
      return this.buildHostSource(scope.scopeKey as HostScopeKey)
    }
    const diskKey = await this.resolvePluginDiskKey(scope.scopeKey)
    const src = this.readPluginSource(diskKey)
    if (!src.packJson) {
      throw new CommException(
        `插件「${scope.scopeKey}」未找到 locales/zh-CN.json`,
      )
    }
    return src.packJson
  }

  /** 列出可用于翻译的 chat 模型 */
  async listChatModels() {
    const tenantId = normalizeTenantId(Context.get()?.tenantId)
    const list = await this.modelRepo.find(
      and(
        eq(aiModel.tenantId, tenantId),
        eq(aiModel.status, 1),
        isNull(aiModel.deletedAt),
      ),
      { orderBy: [desc(aiModel.id)] },
    )
    return (list ?? []).filter((m) =>
      (m.capabilities ?? []).includes('chat'),
    )
  }

  /**
   * AI 翻译（SSE：delta 推原文，done 带 packJson；不落库）
   */
  async *translateByAiStream(body: {
    langCode: string
    langName?: string
    scopeType?: string
    scopeKey?: string
    model?: string
  }): AsyncGenerator<{
    type: 'delta' | 'done' | 'error'
    text?: string
    data?: Record<string, unknown>
    error?: { code: string; message: string }
  }> {
    try {
      const langCode = String(body.langCode || '').trim()
      if (!langCode) throw new CommException('目标语种不能为空')
      if (langCode === 'zh-CN') {
        throw new CommException('zh-CN 为源语言，无需 AI 翻译')
      }

      const scope = normalizeScope(body.scopeType, body.scopeKey)
      const tenantId = normalizeTenantId(Context.get()?.tenantId)

      let langName = String(body.langName || '').trim()
      if (!langName) {
        const [lang] = await this.langRepo.find(
          and(
            eq(i18nLang.tenantId, tenantId),
            eq(i18nLang.code, langCode),
            isNull(i18nLang.deletedAt),
          ),
        )
        langName = lang?.name || langCode
      }

      const models = await this.listChatModels()
      if (!models.length) {
        throw new CommException('请先配置 AI 能力')
      }
      const modelCode = String(body.model || '').trim()
      if (!modelCode) throw new CommException('请选择 AI 模型')
      if (!models.some((m) => m.code === modelCode)) {
        throw new CommException(`模型不可用或不支持对话: ${modelCode}`)
      }

      const source = await this.resolveSourcePack(scope)
      const sourceFlat = flattenLocale(source)

      const out = await this.aiGateway.call(
        {
          model: modelCode,
          capability: 'chat',
          input: {
            messages: [
              {
                role: 'system',
                content:
                  'You are a professional UI i18n translator. Translate JSON string values only. Keep all keys unchanged. Keep placeholders like {name}, {{count}} intact. Output a single JSON object only, no markdown.',
              },
              {
                role: 'user',
                content: `Translate the following UI locale JSON from Simplified Chinese (zh-CN) into ${langName} (${langCode}). Return the full JSON object with the same keys.\n\n${JSON.stringify(source, null, 2)}`,
              },
            ],
          },
        },
        { source: 'i18n' },
      )

      let text = ''
      if (out.kind === 'stream') {
        for await (const chunk of out.stream) {
          if (chunk.type === 'error') {
            yield {
              type: 'error',
              error: {
                code: chunk.error?.code || 'ai',
                message: chunk.error?.message || 'AI 翻译失败',
              },
            }
            return
          }
          if (chunk.type === 'delta' && chunk.text) {
            text += chunk.text
            yield { type: 'delta', text: chunk.text, data: { fullText: text } }
          }
          if (chunk.type === 'done') {
            text = String(chunk.text || chunk.data?.text || text)
            break
          }
        }
      } else {
        if (!out.ok) {
          throw new CommException(out.error?.message || 'AI 翻译失败')
        }
        text = String((out.data as { text?: string } | undefined)?.text || '')
        if (text) {
          yield { type: 'delta', text, data: { fullText: text } }
        }
      }

      if (!text.trim()) {
        throw new CommException('AI 未返回翻译内容')
      }

      let translated = extractJsonObject(text)
      const translatedFlat = flattenLocale(translated)
      const mergedFlat: Record<string, string> = { ...sourceFlat }
      for (const [k, v] of Object.entries(translatedFlat)) {
        if (k in sourceFlat && v.trim()) mergedFlat[k] = v
      }
      translated = unflattenLocale(mergedFlat)

      yield {
        type: 'done',
        text,
        data: {
          fullText: text,
          langCode,
          scopeType: scope.scopeType,
          scopeKey: scope.scopeKey,
          packJson: translated,
        },
      }
    } catch (e) {
      yield {
        type: 'error',
        error: {
          code: 'translate',
          message: e instanceof Error ? e.message : String(e),
        },
      }
    }
  }

  /** @deprecated 兼容：收齐流后返回 packJson */
  async translateByAi(body: {
    langCode: string
    langName?: string
    scopeType?: string
    scopeKey?: string
    model?: string
  }) {
    let packJson: Record<string, unknown> | undefined
    let langCode = ''
    let scopeType = ''
    let scopeKey = ''
    for await (const chunk of this.translateByAiStream(body)) {
      if (chunk.type === 'error') {
        throw new CommException(chunk.error?.message || 'AI 翻译失败')
      }
      if (chunk.type === 'done') {
        packJson = chunk.data?.packJson as Record<string, unknown> | undefined
        langCode = String(chunk.data?.langCode || '')
        scopeType = String(chunk.data?.scopeType || '')
        scopeKey = String(chunk.data?.scopeKey || '')
      }
    }
    if (!packJson) throw new CommException('AI 未返回翻译内容')
    return { langCode, scopeType, scopeKey, packJson }
  }

  /** 写入/更新某一条 zh-CN 源语言包（含软删行：恢复后更新，避免唯一索引冲突） */
  private async upsertZhPack(
    scopeType: 'host' | 'plugin',
    scopeKey: string,
    packJson: Record<string, unknown>,
  ) {
    const tenantId = normalizeTenantId(Context.get()?.tenantId)
    const [existing] = await this.packRepo.find(
      and(
        eq(i18nPack.tenantId, tenantId),
        eq(i18nPack.langCode, 'zh-CN'),
        eq(i18nPack.scopeType, scopeType),
        eq(i18nPack.scopeKey, scopeKey),
      ),
      { withTrashed: true },
    )
    const sourceHash = hashLocaleJson(packJson)
    if (existing) {
      if (existing.deletedAt) {
        await this.packRepo.restore(eq(i18nPack.id, existing.id))
      }
      await this.packRepo.update(eq(i18nPack.id, existing.id), {
        packJson,
        version: Number(existing.version || 1) + 1,
        sourceHash,
      })
      return this.findPack({ langCode: 'zh-CN', scopeType, scopeKey })
    }
    await this.packRepo.create({
      tenantId,
      langCode: 'zh-CN',
      scopeType,
      scopeKey,
      packJson,
      version: 1,
      sourceHash,
    })
    return this.findPack({ langCode: 'zh-CN', scopeType, scopeKey })
  }

  /** 确保指定宿主端 zh-CN 源包存在 */
  async ensureHostZhPack(scopeKey: HostScopeKey = 'admin') {
    const disk = await this.readHostSource(scopeKey)
    if (!disk.packJson) {
      if (isFrontScopeKey(scopeKey)) {
        if (!isFrontLocaleSyncEnabled()) {
          throw new CommException(
            `vome.eps 未开启，跳过同步前端语言包 ${scopeKey}`,
          )
        }
        const origin = localeOriginOf(scopeKey)
        const url = frontLocaleUrl(scopeKey)
        throw new CommException(
          url
            ? `未拉取到 ${scopeKey} 语言包（${url}），请确认前端已启动`
            : origin
              ? `未拉取到 ${scopeKey} 语言包，请确认前端已启动`
              : `未配置 system.localeOrigins.${scopeKey}`,
        )
      }
      throw new CommException(
        `未找到宿主原始语言包 admin/locales/zh-CN.json`,
      )
    }
    const packJson = await this.buildHostSource(scopeKey)
    return this.upsertZhPack('host', scopeKey, packJson)
  }

  /**
   * 已安装业务模块（磁盘 ~/.vome/.../modules）
   * 含纯前端无 hook：不同步依赖 base_plugin_info
   */
  private listInstalledModules(): Array<{ key: string; name: string }> {
    const root = pModulesPath()
    if (!existsSync(root)) return []
    const out: Array<{ key: string; name: string }> = []
    for (const name of readdirSync(root)) {
      const dir = join(root, name)
      try {
        if (!statSync(dir).isDirectory()) continue
      } catch {
        continue
      }
      const metaPath = join(dir, 'module.json')
      if (!existsSync(metaPath)) continue
      try {
        const manifest = JSON.parse(readFileSync(metaPath, 'utf8')) as {
          key?: string
          name?: string
        }
        const key = String(manifest.key || name).trim()
        if (!key) continue
        const label = String(manifest.name || '').trim() || key
        out.push({ key, name: label })
      } catch {
        /* skip broken module */
      }
    }
    return out
  }

  /**
   * 同步语言包：admin 磁盘 +（eps 开启时）web/uniapp HTTP + 已安装模块
   */
  async syncAllZhSources() {
    const hosts: Array<{
      scopeKey: string
      version: number
      path: string | null
    }> = []
    const hostSkipped: Array<{ scopeKey: string; reason: string }> = []

    for (const key of HOST_SCOPE_KEYS) {
      try {
        if (isFrontScopeKey(key) && !isFrontLocaleSyncEnabled()) {
          hostSkipped.push({
            scopeKey: key,
            reason: 'vome.eps 未开启，跳过前端语言包同步',
          })
          continue
        }
        if (isFrontScopeKey(key) && !localeOriginOf(key)) {
          hostSkipped.push({
            scopeKey: key,
            reason: `未配置 system.localeOrigins.${key}`,
          })
          continue
        }
        const disk = await this.readHostSource(key)
        if (!disk.packJson) {
          hostSkipped.push({
            scopeKey: key,
            reason: isFrontScopeKey(key)
              ? `未拉取到语言包（${frontLocaleUrl(key) || localeOriginOf(key)}）`
              : '未找到 admin/locales/zh-CN.json',
          })
          continue
        }
        const row = await this.ensureHostZhPack(key)
        hosts.push({
          scopeKey: key,
          version: Number(row?.version ?? 0),
          path: disk.path,
        })
      } catch (e) {
        hostSkipped.push({
          scopeKey: key,
          reason: e instanceof Error ? e.message : String(e),
        })
      }
    }

    if (!hosts.some((h) => h.scopeKey === 'admin')) {
      throw new CommException(
        hostSkipped.find((h) => h.scopeKey === 'admin')?.reason ||
          '同步失败：缺少 admin 宿主语言包',
      )
    }

    const modules = this.listInstalledModules()

    const synced: Array<{ pluginKey: string; path: string }> = []
    const skipped: Array<{ pluginKey: string; reason: string }> = []

    for (const m of modules) {
      const { key, name: label } = m
      try {
        const src = this.readPluginSource(key)
        if (!src.packJson || !src.path) {
          skipped.push({ pluginKey: key, reason: '未找到 locales/zh-CN.json' })
          continue
        }
        await this.upsertZhPack('plugin', label, src.packJson)
        // 旧数据用 module.key 作标识时，迁到名称后清掉旧行
        if (label !== key) {
          const [legacy] = await this.packRepo.find(
            and(
              eq(i18nPack.tenantId, normalizeTenantId(Context.get()?.tenantId)),
              eq(i18nPack.langCode, 'zh-CN'),
              eq(i18nPack.scopeType, 'plugin'),
              eq(i18nPack.scopeKey, key),
            ),
            { withTrashed: true },
          )
          if (legacy?.id != null) {
            await this.packRepo.softDelete(eq(i18nPack.id, legacy.id))
          }
        }
        synced.push({ pluginKey: key, path: src.path })
      } catch (e) {
        skipped.push({
          pluginKey: key,
          reason: e instanceof Error ? e.message : String(e),
        })
      }
    }

    return {
      hosts,
      hostSkipped,
      host: hosts.find((h) => h.scopeKey === 'admin') ?? null,
      plugins: {
        total: modules.length,
        synced: synced.length,
        skipped: skipped.length,
        items: synced,
        skippedItems: skipped,
      },
    }
  }
}
