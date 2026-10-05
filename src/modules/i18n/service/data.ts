import { createHash } from 'node:crypto'
import { and, asc, eq, gt, inArray, isNull } from 'drizzle-orm'
import type { Table } from 'drizzle-orm'
import { buildTableMap } from '../../../lib/db/init/table-map'
import {
  applyChineseSegmentMap,
  applyDataI18nDefault,
  BaseService,
  CommException,
  DbStore,
  extractChineseSegments,
  getColumnComments,
  getRepository,
  getSourceLang,
  hasChinese,
  Inject,
  InjectRepository,
  Ioc,
  isSourceLang,
  Provide,
  registerDataI18nApplier,
  registerDataI18nFieldLoader,
  getDataI18nFieldConfigs,
  getDataI18nSeeds,
  resolveDataI18nSeedField,
  listDataI18nTables,
  registerOnForceDelete,
  type DataI18nFieldConfig,
  type DataI18nPackMap,
  type Repository,
} from '@core/server'
import { AiGateway } from '../../ai/service/gateway'
import { aiModel } from '../../ai/entity/model'
import { i18nLang } from '../entity/lang'
import { i18nDataField } from '../entity/data-field'
import { i18nDataPack } from '../entity/data-pack'
import {
  I18N_DATA_LINE_OUTPUT_RULES,
  I18N_DATA_TRANSLATE_SYSTEM,
  i18nDataTranslateUserContent,
} from '../lib/ai-translate-prompt'
import {
  batchNumberedPlainItems,
  DATA_I18N_AI_PAYLOAD_MAX_CHARS,
  DATA_I18N_PLAIN_FIELD_CHARS,
  finalizeMaskedTranslation,
  formatNumberedPlainBatch,
  listMissingNumberedIds,
  maskNonChineseWithPlaceholders,
  parseNumberedPlainBatchLoose,
  restoreMaskedPlaceholders,
  type NumberedPlainItem,
} from '../lib/sentence-chunks'

function hashPackSource(pack: DataI18nPackMap): string {
  const keys = Object.keys(pack).sort()
  const payload = keys
    .map((pk) => {
      const bag = pack[pk] || {}
      const fields = Object.keys(bag)
        .sort()
        .map((f) => `${f}=${bag[f]}`)
        .join('|')
      return `${pk}:${fields}`
    })
    .join('\n')
  return createHash('sha256').update(payload).digest('hex').slice(0, 32)
}

/** 与 BaseService.page 单页上限一致：每翻 100 行就送 AI，再翻下一批 */
const DATA_I18N_PAGE_SIZE = 100

/** 非 CJK 目标语：译文里残留的中文/全角标点 */
const CJK_PUNCT_RE = /[\u3001-\u303f\uff01-\uff0f\uff1a-\uff1f]/

/** 目标语本身可含汉字（繁中/日/韩），不能用「译文含源中文片段」判定未译完 */
function isCjkTargetLang(langCode: string) {
  const c = String(langCode || '')
    .trim()
    .toLowerCase()
  return c.startsWith('zh') || c.startsWith('ja') || c.startsWith('ko')
}

/**
 * jsonb / 对象字段不能 String()（会变成 [object Object]），须 JSON.stringify
 * 才能走 extractChineseSegments / 语言 Tab / AI 抽词。
 */
function toDataI18nText(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return ''
    }
  }
  return String(value)
}

/** pack 里存的是 JSON 文本时，还原回对象/数组（与业务 jsonb 列对齐） */
function reviveDataI18nJsonValue(
  translated: unknown,
  original: unknown,
): unknown {
  if (original == null || typeof original !== 'object') return translated
  if (typeof translated !== 'string') return translated
  const s = translated.trim()
  if (!s || (s[0] !== '{' && s[0] !== '[')) return translated
  try {
    const parsed = JSON.parse(s) as unknown
    if (parsed && typeof parsed === 'object') return parsed
  } catch {
    /* keep string */
  }
  return translated
}

function asDataI18nRowList(rows: unknown): Record<string, unknown>[] {
  if (Array.isArray(rows)) return rows as Record<string, unknown>[]
  if (rows && typeof rows === 'object') {
    const list = (rows as { list?: unknown }).list
    if (Array.isArray(list)) return list as Record<string, unknown>[]
  }
  return []
}

/** jsonb 等对象字段序列化后的 JSON 文本：走抽词替换，避免整段 mask 弄丢 URL/结构 */
function isJsonDataI18nText(raw: string): boolean {
  const s = String(raw || '').trim()
  if (!s || (s[0] !== '{' && s[0] !== '[')) return false
  try {
    const v = JSON.parse(s) as unknown
    return v != null && typeof v === 'object'
  } catch {
    return false
  }
}

type FieldMaskEntry =
  | { kind: 'plain'; masked: string; slots: string[]; hasSource: boolean }
  | { kind: 'json'; segs: string[] }

/**
 * 拆词替换后整理（仅非 CJK 目标语）：
 * - 数字与拉丁词粘连补空格（最少2人 → 最少 2 personas）
 * - 残留中文标点换成西文
 */
function polishNonCjkTranslation(text: string): string {
  let s = String(text || '')
  if (!s) return s
  s = s.replace(/(\d)([A-Za-zÀ-ÿ])/g, '$1 $2')
  s = s.replace(/([A-Za-zÀ-ÿ])(\d)/g, '$1 $2')
  s = s
    .replace(/\u3001/g, ',')
    .replace(/\u3002/g, '.')
    .replace(/\uff0c/g, ',')
    .replace(/\uff0e/g, '.')
    .replace(/\uff1a/g, ':')
    .replace(/\uff1b/g, ';')
    .replace(/\uff01/g, '!')
    .replace(/\uff1f/g, '?')
    .replace(/\u2026/g, '...')
  return s
}

/** 该字段是否仍需翻译（缺译文 / 仍等于原文 / 非 CJK 译文里还留着源语言片段） */
function fieldNeedsTranslate(
  raw: string,
  prev: string | undefined,
  seedValue?: string,
  langCode?: string,
): boolean {
  const seed = String(seedValue || '').trim()
  if (seed) {
    if (prev === seed) return false
    if (!prev || !String(prev).trim() || prev === raw) return true
    return prev !== seed
  }
  if (!prev || !String(prev).trim()) return true
  // 繁中等同形、日韩保留汉字名：与源文相同也算已译
  if (prev === raw) {
    return !isCjkTargetLang(langCode || '')
  }
  // 英欧等：译文里还残留源中文片段 / 中文标点 → 未译完；CJK 目标语跳过此检查
  if (!isCjkTargetLang(langCode || '')) {
    if (CJK_PUNCT_RE.test(prev)) return true
    for (const seg of extractChineseSegments(raw)) {
      if (prev.includes(seg)) return true
    }
  }
  return false
}

@Provide()
export class I18nDataService extends BaseService {
  @InjectRepository(i18nDataField)
  fieldRepo: Repository<typeof i18nDataField>

  @InjectRepository(i18nDataPack)
  packRepo: Repository<typeof i18nDataPack>

  @InjectRepository(i18nLang)
  langRepo: Repository<typeof i18nLang>

  @InjectRepository(aiModel)
  modelRepo: Repository<typeof aiModel>

  @Inject()
  aiGateway: AiGateway

  private static registered = false

  constructor() {
    super()
    if (!I18nDataService.registered) {
      I18nDataService.registered = true
      registerDataI18nFieldLoader((tableName) => this.listEnabledFields(tableName))
      registerDataI18nApplier(async (rows, ctx) => {
        const list = asDataI18nRowList(rows)
        const objectFields = ctx.fields
          .filter((f) => f.enabled && f.mode === 'direct')
          .map((f) => f.fieldName)
        const originals = list.map((row) => {
          const snap: Record<string, unknown> = {}
          for (const field of objectFields) {
            const v = row?.[field]
            if (v && typeof v === 'object') snap[field] = v
          }
          return snap
        })
        const out = await applyDataI18nDefault(rows, {
          ...ctx,
          loadPack: (table) => this.loadPackMap(table, ctx.langCode),
          resolveSourcePk: (input) => this.resolveSourcePk(input),
        })
        const outList = asDataI18nRowList(out)
        for (let i = 0; i < outList.length; i++) {
          const row = outList[i]
          const snap = originals[i]
          if (!row || !snap) continue
          for (const [field, orig] of Object.entries(snap)) {
            row[field] = reviveDataI18nJsonValue(row[field], orig)
          }
        }
        return out
      })
    }
  }

  /** 启动灌数据翻译字段 / 包缓存 */
  override async init() {
    await Promise.all([
      this.cacheSet('i18n_data_field', await this.loadAllFields()),
      this.cacheSet('i18n_data_pack', await this.loadAllPacks()),
    ])
  }

  private tableMap(): Map<string, Table> {
    const schema = Ioc.get(DbStore).schema
    if (!schema) return new Map()
    return buildTableMap(schema)
  }

  private rowToFieldConfig(row: typeof i18nDataField.$inferSelect): DataI18nFieldConfig {
    return {
      tableName: row.tableName,
      fieldName: row.fieldName,
      pkField: row.pkField || 'id',
      enabled: row.status === 1,
      mode: row.mode === 'ref' ? 'ref' : 'direct',
      sourceTable: row.sourceTable || undefined,
      sourcePkField: row.sourcePkField || 'id',
      sourceField: row.sourceField || undefined,
      joinField: row.joinField || undefined,
      sourceJoinField: row.sourceJoinField || row.joinField || undefined,
    }
  }

  private async loadAllFields() {
    return (
      (await this.fieldRepo.find(isNull(i18nDataField.deleteTime), {
        orderBy: [asc(i18nDataField.id)],
      })) ?? []
    )
  }

  private async loadAllPacks() {
    return (
      (await this.packRepo.find(isNull(i18nDataPack.deleteTime), {
        orderBy: [asc(i18nDataPack.id)],
      })) ?? []
    )
  }

  async listEnabledFields(tableName: string): Promise<DataI18nFieldConfig[]> {
    const table = String(tableName || '').trim()
    // 数据翻译字段全局共用，不按 tenantId 过滤
    const rows = await this.cacheGet<typeof i18nDataField.$inferSelect>(
      'i18n_data_field',
      () => this.loadAllFields(),
    )
    const fromDb = rows
      .filter((r) => String(r.tableName) === table && Number(r.status) === 1)
      .map((r) => this.rowToFieldConfig(r))
    const fromDecl = getDataI18nFieldConfigs(table)
    const merged = new Map<string, DataI18nFieldConfig>()
    for (const f of fromDb) merged.set(f.fieldName, f)
    for (const f of fromDecl) merged.set(f.fieldName, f)
    return [...merged.values()]
  }

  async invalidateFieldCache(_tableName?: string) {
    await this.cacheDel('i18n_data_field')
  }

  async invalidatePackCache(_tableName?: string, _langCode?: string) {
    await this.cacheDel('i18n_data_pack')
  }

  async loadPackMap(
    tableName: string,
    langCode: string,
  ): Promise<DataI18nPackMap | null> {
    const code = String(langCode || '').trim()
    if (!code) return null
    const table = String(tableName || '').trim()
    // 翻译包全局共用，不按 tenantId 过滤
    const rows = await this.cacheGet<typeof i18nDataPack.$inferSelect>(
      'i18n_data_pack',
      () => this.loadAllPacks(),
    )
    const row = rows.find(
      (r) => String(r.tableName) === table && String(r.langCode) === code,
    )
    let raw: unknown = row?.packJson
    if (typeof raw === 'string') {
      try {
        raw = JSON.parse(raw)
      } catch {
        return {}
      }
    }
    return (raw as DataI18nPackMap | undefined) || {}
  }

  async resolveSourcePk(input: {
    sourceTable: string
    sourcePkField: string
    sourceJoinField: string
    joinValues: unknown[]
  }): Promise<Map<string, string>> {
    const map = new Map<string, string>()
    const table = this.tableMap().get(input.sourceTable)
    if (!table) return map
    const joinCol = (table as unknown as Record<string, unknown>)[
      input.sourceJoinField
    ]
    const pkCol = (table as unknown as Record<string, unknown>)[
      input.sourcePkField
    ]
    if (!joinCol || !pkCol) return map

    const repo = this.getRepoForTable(table)
    const values = input.joinValues.filter((v) => v != null && v !== '')
    if (!values.length) return map

    const rows = await repo.find(inArray(joinCol as never, values as never[]))
    for (const row of rows as Record<string, unknown>[]) {
      const joinVal = row[input.sourceJoinField]
      const pk = row[input.sourcePkField]
      if (joinVal == null || pk == null) continue
      map.set(String(joinVal), String(pk))
    }
    return map
  }

  private getRepoForTable(table: Table) {
    return getRepository(table)
  }

  async modifyFieldBefore(
    data: Record<string, unknown>,
    type: 'add' | 'update' | 'delete',
  ) {
    if (type === 'delete') {
      await this.invalidateFieldCache(String(data.tableName || ''))
      return
    }
    const tableName = String(data.tableName ?? '').trim()
    const fieldName = String(data.fieldName ?? '').trim()
    if (!tableName) throw new CommException('业务表名不能为空')
    if (!fieldName) throw new CommException('字段名不能为空')
    data.tableName = tableName
    data.fieldName = fieldName
    data.pkField = String(data.pkField ?? 'id').trim() || 'id'
    const mode = String(data.mode ?? 'direct').trim() === 'ref' ? 'ref' : 'direct'
    data.mode = mode
    if (mode === 'ref') {
      const sourceTable = String(data.sourceTable ?? '').trim()
      const joinField = String(data.joinField ?? '').trim()
      if (!sourceTable) throw new CommException('ref 模式须填写源表')
      if (!joinField) throw new CommException('ref 模式须填写关联列')
      data.sourceTable = sourceTable
      data.joinField = joinField
      data.sourceJoinField =
        String(data.sourceJoinField ?? joinField).trim() || joinField
      data.sourceField =
        String(data.sourceField ?? fieldName).trim() || fieldName
      data.sourcePkField = String(data.sourcePkField ?? 'id').trim() || 'id'
    } else {
      data.sourceTable = null
      data.sourcePkField = null
      data.sourceField = null
      data.joinField = null
      data.sourceJoinField = null
    }
    // 字段唯一靠 uniqueIndex；软删 add 撞键由 Repository upsert
    await this.invalidateFieldCache(tableName)
  }

  /** 列出已配置翻译字段的业务表 */
  async listDistinctTables(): Promise<string[]> {
    const rows = await this.fieldRepo.find(
      isNull(i18nDataField.deleteTime),
    )
    const set = new Set(rows.map((r) => r.tableName).filter(Boolean))
    for (const t of listDataI18nTables()) set.add(t)
    return [...set].sort()
  }

  private pkColumn(table: Table, pkField: string) {
    const col = (table as unknown as Record<string, unknown>)[pkField]
    if (!col) throw new CommException(`表无主键列 ${pkField}`)
    return col
  }

  /** 游标翻页：id > afterId，按 id 升序，每页 size 条 */
  private async fetchRowsAfterId(opts: {
    table: Table
    pkField: string
    afterId: string | number | null
    size: number
  }): Promise<Record<string, unknown>[]> {
    const idCol = this.pkColumn(opts.table, opts.pkField)
    const delCol = (opts.table as unknown as { deleteTime?: unknown }).deleteTime
    // 禁止 findPage：每页都会 COUNT(*)，game_skin 等大表连扫会把远程连接打挂
    const clauses = [] as unknown[]
    if (delCol) clauses.push(isNull(delCol as never))
    if (opts.afterId != null && opts.afterId !== '') {
      clauses.push(gt(idCol as never, opts.afterId as never))
    }
    const where =
      clauses.length === 0
        ? undefined
        : clauses.length === 1
          ? clauses[0]
          : and(...(clauses as [never, ...never[]]))
    const drizzle = Ioc.get(DbStore).drizzle as {
      select: () => { from: (t: Table) => any }
    }
    let q: any = drizzle.select().from(opts.table)
    if (where) q = q.where(where)
    q = q.orderBy(asc(idCol as never)).limit(opts.size)
    return (await q) as Record<string, unknown>[]
  }

  private coercePk(raw: unknown): string | number {
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw
    const s = String(raw ?? '').trim()
    if (/^\d+$/.test(s)) return Number(s)
    return s
  }

  private buildRowChineseBag(
    row: Record<string, unknown>,
    fieldNames: string[],
    pkField: string,
  ): { pk: string; bag: Record<string, string> } | null {
    const pk = String(row[pkField] ?? '').trim()
    if (!pk) return null
    const bag: Record<string, string> = {}
    for (const field of fieldNames) {
      const raw = toDataI18nText(row[field]).trim()
      if (!raw || !hasChinese(raw)) continue
      bag[field] = raw
    }
    if (!Object.keys(bag).length) return null
    return { pk, bag }
  }

  /**
   * 增量：按 id 升序找到第一个仍需翻译的行，返回其前一条 id（下一批 from id > cursor）
   * 已全部译完则返回 { done: true }
   */
  private async findIncrementalCursor(opts: {
    table: Table
    pkField: string
    fieldNames: string[]
    existing: DataI18nPackMap
    langCode: string
    seeds: ReturnType<typeof getDataI18nSeeds>
  }): Promise<{ done: true } | { done: false; afterId: string | number | null }> {
    let afterId: string | number | null = null
    for (;;) {
      const list = await this.fetchRowsAfterId({
        table: opts.table,
        pkField: opts.pkField,
        afterId,
        size: DATA_I18N_PAGE_SIZE,
      })
      if (!list.length) return { done: true }
      for (const row of list) {
        const built = this.buildRowChineseBag(
          row,
          opts.fieldNames,
          opts.pkField,
        )
        if (!built) {
          afterId = this.coercePk(row[opts.pkField])
          continue
        }
        let need = false
        for (const [field, raw] of Object.entries(built.bag)) {
          const seedFrom = resolveDataI18nSeedField(
            opts.seeds,
            field,
            opts.langCode,
          )
          const seedVal = seedFrom
            ? String(row[seedFrom] ?? '').trim()
            : ''
          if (
            fieldNeedsTranslate(
              raw,
              opts.existing[built.pk]?.[field],
              seedVal || undefined,
              opts.langCode,
            )
          ) {
            need = true
            break
          }
        }
        if (need) {
          return { done: false, afterId }
        }
        afterId = this.coercePk(row[opts.pkField])
      }
      if (list.length < DATA_I18N_PAGE_SIZE) return { done: true }
    }
  }

  /**
   * AI 翻译业务表（SSE）
   * 纯文本 + __PH_n__ 占位；短字段编号行分批（N:text），长文整篇一次；每页落库便于断点续跑。
   */
  async *translateTableByAiStream(body: {
    tableName: string
    langCode: string
    langName?: string
    mode?: 'full' | 'incremental'
    model?: string
  }): AsyncGenerator<{
    type: 'delta' | 'done' | 'error'
    text?: string
    data?: Record<string, unknown>
    error?: { code: string; message: string }
  }> {
    try {
      const tableName = String(body.tableName || '').trim()
      const langCode = String(body.langCode || '').trim()
      if (!tableName) throw new CommException('tableName 不能为空')
      if (!langCode) {
        throw new CommException('目标语种不能为空')
      }
      const srcLang = getSourceLang()
      if (!srcLang) {
        throw new CommException('未配置 system.lang（源语言）')
      }
      if (isSourceLang(langCode)) {
        throw new CommException(`${srcLang} 为源语言，无需 AI 翻译`)
      }

      const enabled = (await this.listEnabledFields(tableName)).filter(
        (f) => f.mode === 'direct',
      )
      if (!enabled.length) {
        throw new CommException(
          `表 ${tableName} 无 direct 翻译字段（请在 Controller 声明 dataI18n 或配置业务字段）`,
        )
      }

      const table = this.tableMap().get(tableName)
      if (!table) throw new CommException(`未找到表 ${tableName}`)

      const fieldNames = enabled.map((c) => c.fieldName)
      const pkField = enabled[0]?.pkField || 'id'
      const seeds = getDataI18nSeeds(tableName)
      const incremental = body.mode !== 'full'

      // 尽早推一帧，避免代理/客户端在首包 AI 前空等
      yield {
        type: 'delta',
        text: '',
        data: {
          stage: 'start',
          tableName,
          langCode,
          mode: incremental ? 'incremental' : 'full',
        },
      }

      // 只读当前表×语 pack，禁止走 loadPackMap→loadAllPacks（全表 JSON 极大，每对要数分钟）
      const existingPackRow = incremental
        ? await this.packRepo.findOne(
            and(
              eq(i18nDataPack.tableName, tableName),
              eq(i18nDataPack.langCode, langCode),
            ),
          )
        : null
      let nextPack: DataI18nPackMap = {}
      if (incremental && existingPackRow?.packJson != null) {
        let raw: unknown = existingPackRow.packJson
        if (typeof raw === 'string') {
          try {
            raw = JSON.parse(raw)
          } catch {
            raw = {}
          }
        }
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
          nextPack = { ...(raw as DataI18nPackMap) }
        }
      }

      const langName =
        body.langName ||
        (
          await this.langRepo.find(
            and(eq(i18nLang.code, langCode), isNull(i18nLang.deleteTime)),
          )
        )[0]?.name ||
        langCode

      let afterId: string | number | null = null
      let saved: { version?: number } | undefined
      if (incremental) {
        const existingHash = String(existingPackRow?.sourceHash || '').trim()
        yield {
          type: 'delta',
          text: '',
          data: {
            stage: existingHash ? 'cursor' : 'hash',
            tableName,
            langCode,
          },
        }

        if (!existingHash) {
          // 无 hash：一趟扫完「是否待译 + 攒 sourceHash」，禁止 cursor 后再全表扫第二遍
          const fullSource: DataI18nPackMap = {}
          let scanAfter: string | number | null = null
          let prevPk: string | number | null = null
          let needAfterId: string | number | null | undefined
          for (;;) {
            const scanList = await this.fetchRowsAfterId({
              table,
              pkField,
              afterId: scanAfter,
              size: DATA_I18N_PAGE_SIZE,
            })
            if (!scanList.length) break
            for (const row of scanList) {
              const built = this.buildRowChineseBag(row, fieldNames, pkField)
              if (!built) {
                prevPk = this.coercePk(row[pkField])
                continue
              }
              fullSource[built.pk] = built.bag
              if (needAfterId === undefined) {
                let need = false
                for (const [field, raw] of Object.entries(built.bag)) {
                  const seedFrom = resolveDataI18nSeedField(
                    seeds,
                    field,
                    langCode,
                  )
                  const seedVal = seedFrom
                    ? String(row[seedFrom] ?? '').trim()
                    : ''
                  if (
                    fieldNeedsTranslate(
                      raw,
                      nextPack[built.pk]?.[field],
                      seedVal || undefined,
                      langCode,
                    )
                  ) {
                    need = true
                    break
                  }
                }
                if (need) needAfterId = prevPk
              }
              prevPk = this.coercePk(row[pkField])
            }
            if (needAfterId !== undefined) break
            scanAfter = this.coercePk(scanList[scanList.length - 1]?.[pkField])
            if (scanList.length < DATA_I18N_PAGE_SIZE) break
          }
          if (needAfterId !== undefined) {
            afterId = needAfterId
          } else {
            const sourceHash = hashPackSource(fullSource)
            saved = await this.upsertPack(
              tableName,
              langCode,
              nextPack,
              sourceHash,
            )
            yield {
              type: 'done',
              data: {
                tableName,
                langCode,
                skipped: true,
                message: '译文已完整，已补写 sourceHash',
                rowCount: Object.keys(nextPack).length,
                version: saved?.version,
                sourceHash,
              },
            }
            return
          }
        } else {
          const cursor = await this.findIncrementalCursor({
            table,
            pkField,
            fieldNames,
            existing: nextPack,
            langCode,
            seeds,
          })
          if (cursor.done === false) {
            afterId = cursor.afterId
          } else {
            yield {
              type: 'done',
              data: {
                tableName,
                langCode,
                skipped: true,
                message: '译文已完整，跳过增量翻译',
                rowCount: Object.keys(nextPack).length,
                sourceHash: existingHash,
              },
            }
            return
          }
        }
      }

      let modelCode = ''
      /** masked 文 → 译文（占位符仍在）；同 masked 跨行复用 */
      const maskedDict: Record<string, string> = {}
      const allSourcePack: DataI18nPackMap = {}
      let translatedRowCount = 0
      let pageNo = 0
      const aiHint =
        'Output numbered lines N:translated_text only. Keep every __PH_n__ placeholder unchanged; only translate source-language text around them.'

      for (;;) {
        const list = await this.fetchRowsAfterId({
          table,
          pkField,
          afterId,
          size: DATA_I18N_PAGE_SIZE,
        })
        if (!list.length) break
        pageNo += 1

        const pageBags: Array<{
          pk: string
          bag: Record<string, string>
          row: Record<string, unknown>
        }> = []
        for (const row of list) {
          const built = this.buildRowChineseBag(row, fieldNames, pkField)
          if (!built) continue
          allSourcePack[built.pk] = built.bag
          if (incremental) {
            let need = false
            for (const [field, raw] of Object.entries(built.bag)) {
              const seedFrom = resolveDataI18nSeedField(seeds, field, langCode)
              const seedVal = seedFrom
                ? String(row[seedFrom] ?? '').trim()
                : ''
              if (
                fieldNeedsTranslate(
                  raw,
                  nextPack[built.pk]?.[field],
                  seedVal || undefined,
                  langCode,
                )
              ) {
                need = true
                break
              }
            }
            if (!need) continue
          }
          pageBags.push({ ...built, row })
        }

        /** 非中文→__PH_n__，整段送 AI；JSON 字段只抽中文片段送译再拼回 */
        const toTranslate: Record<string, string> = {}
        const fieldMasks = new Map<string, FieldMaskEntry>()
        for (const { pk, bag, row } of pageBags) {
          for (const [field, raw] of Object.entries(bag)) {
            const seedFrom = resolveDataI18nSeedField(seeds, field, langCode)
            const seedVal = seedFrom
              ? String(row[seedFrom] ?? '').trim()
              : ''
            if (seedVal) continue
            if (
              incremental &&
              !fieldNeedsTranslate(
                raw,
                nextPack[pk]?.[field],
                undefined,
                langCode,
              )
            ) {
              continue
            }
            const fk = `${pk}\t${field}`
            if (isJsonDataI18nText(raw)) {
              const segs = extractChineseSegments(raw).filter((s) =>
                String(s || '').trim(),
              )
              fieldMasks.set(fk, { kind: 'json', segs })
              for (const seg of segs) {
                const segKey = `__seg__\t${seg}`
                if (maskedDict[seg] || toTranslate[segKey]) continue
                toTranslate[segKey] = seg
              }
              continue
            }
            const { masked, slots, hasSource } =
              maskNonChineseWithPlaceholders(raw)
            if (!hasSource) {
              fieldMasks.set(fk, {
                kind: 'plain',
                masked: raw,
                slots: [],
                hasSource: false,
              })
              continue
            }
            fieldMasks.set(fk, { kind: 'plain', masked, slots, hasSource: true })
            if (maskedDict[masked] || toTranslate[fk]) continue
            toTranslate[fk] = masked
          }
        }

        if (Object.keys(toTranslate).length) {
          if (!modelCode) {
            modelCode = await this.resolveModelCode(body.model)
          }

          /** 长文单独整篇；其余编号行分批（全纯文本，无 JSON） */
          const longItems: Array<{ key: string; masked: string }> = []
          const shortItems: Array<{ key: string; masked: string }> = []
          for (const [fk, masked] of Object.entries(toTranslate)) {
            if (String(masked).length >= DATA_I18N_PLAIN_FIELD_CHARS) {
              longItems.push({ key: fk, masked })
            } else {
              shortItems.push({ key: fk, masked })
            }
          }

          // 长文（用户协议等）：纯文本整篇一次译
          for (let pi = 0; pi < longItems.length; pi++) {
            const { masked } = longItems[pi]!
            if (maskedDict[masked]) continue
            const maxTokens = Math.min(
              16_384,
              Math.max(4096, Math.ceil(masked.length * 1.2)),
            )
            const out = await this.aiGateway.call(
              {
                model: modelCode,
                capability: 'chat',
                input: {
                  messages: [
                    {
                      role: 'system',
                      content: [
                        I18N_DATA_TRANSLATE_SYSTEM,
                        `Translate the user message from ${srcLang} into ${langName} (${langCode}).`,
                        'Placeholders look like __PH_0__ __PH_1__ — keep EVERY placeholder EXACTLY unchanged.',
                        'Only translate surrounding source-language text.',
                        'Output the translated document ONLY — no JSON, no numbered lines, no markdown fences, no commentary.',
                      ].join('\n\n'),
                    },
                    { role: 'user', content: masked },
                  ],
                  max_tokens: maxTokens,
                },
                options: { stream: true },
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
                  yield {
                    type: 'delta',
                    text: chunk.text,
                    data: {
                      fullText: text,
                      page: pageNo,
                      plain: pi + 1,
                      plains: longItems.length,
                      pageSize: DATA_I18N_PAGE_SIZE,
                      afterId,
                    },
                  }
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
              text = String(
                (out.data as { text?: string } | undefined)?.text || '',
              )
              if (text) {
                yield {
                  type: 'delta',
                  text,
                  data: {
                    fullText: text,
                    page: pageNo,
                    plain: pi + 1,
                    plains: longItems.length,
                    pageSize: DATA_I18N_PAGE_SIZE,
                    afterId,
                  },
                }
              }
            }
            const body = finalizeMaskedTranslation(masked, text)
            if (!body) {
              throw new CommException(
                `AI 未返回长文翻译（第 ${pageNo} 页 plain ${pi + 1}/${longItems.length}）`,
              )
            }
            maskedDict[masked] = body
          }

          const batches = batchNumberedPlainItems(
            shortItems,
            DATA_I18N_AI_PAYLOAD_MAX_CHARS,
          )
          for (let bi = 0; bi < batches.length; bi++) {
            const batch = batches[bi]!
            yield* this.translateNumberedPlainBatchWithFill({
              items: batch,
              modelCode,
              srcLang,
              langName,
              langCode,
              aiHint,
              pageNo,
              batchIndex: bi + 1,
              batchTotal: batches.length,
              afterId,
              maskedDict,
            })
          }
        }

        for (const { pk, bag, row } of pageBags) {
          const translated: Record<string, string> = {}
          for (const [field, raw] of Object.entries(bag)) {
            const prev = nextPack[pk]?.[field]
            const seedFrom = resolveDataI18nSeedField(seeds, field, langCode)
            const seedVal = seedFrom
              ? String(row[seedFrom] ?? '').trim()
              : ''
            if (
              incremental &&
              !fieldNeedsTranslate(raw, prev, seedVal || undefined, langCode)
            ) {
              translated[field] = String(prev)
              continue
            }
            if (seedVal) {
              translated[field] = seedVal
              continue
            }
            const fk = `${pk}\t${field}`
            const mask = fieldMasks.get(fk)
            if (!mask) {
              if (prev && String(prev).trim() && prev !== raw) {
                translated[field] = String(prev)
              }
              continue
            }
            if (mask.kind === 'json') {
              if (!mask.segs.length) {
                translated[field] = raw
                continue
              }
              const segMap: Record<string, string> = {}
              let any = false
              for (const seg of mask.segs) {
                const hit = String(maskedDict[seg] || '').trim()
                if (hit) {
                  segMap[seg] = isCjkTargetLang(langCode)
                    ? hit
                    : polishNonCjkTranslation(hit)
                  any = true
                }
              }
              translated[field] = any
                ? applyChineseSegmentMap(raw, segMap)
                : prev && String(prev).trim() && prev !== raw
                  ? String(prev)
                  : raw
              continue
            }
            if (!mask.hasSource) {
              // 无汉字可译：保持原文
              translated[field] = raw
              continue
            }
            const tm = String(maskedDict[mask.masked] || '').trim()
            if (!tm) {
              if (prev && String(prev).trim() && prev !== raw) {
                translated[field] = String(prev)
              }
              continue
            }
            const restored = restoreMaskedPlaceholders(tm, mask.slots)
            translated[field] = isCjkTargetLang(langCode)
              ? restored
              : polishNonCjkTranslation(restored)
          }
          nextPack[pk] = { ...(nextPack[pk] || {}), ...translated }
          translatedRowCount += 1
        }

        saved = await this.upsertPack(tableName, langCode, nextPack)
        await this.invalidatePackCache(tableName, langCode)

        afterId = this.coercePk(list[list.length - 1]?.[pkField])
        if (list.length < DATA_I18N_PAGE_SIZE) break
      }

      if (!incremental) {
        for (const pk of Object.keys(nextPack)) {
          if (!(pk in allSourcePack)) delete nextPack[pk]
        }
      }

      // 整表扫完后必须写 sourceHash（原先用 left.done 卡住：残留中文判定导致永远不写）
      const fullSource: DataI18nPackMap = {}
      let hashAfter: string | number | null = null
      for (;;) {
        const scanList = await this.fetchRowsAfterId({
          table,
          pkField,
          afterId: hashAfter,
          size: DATA_I18N_PAGE_SIZE,
        })
        if (!scanList.length) break
        for (const row of scanList) {
          const built = this.buildRowChineseBag(row, fieldNames, pkField)
          if (built) fullSource[built.pk] = built.bag
        }
        hashAfter = this.coercePk(scanList[scanList.length - 1]?.[pkField])
        if (scanList.length < DATA_I18N_PAGE_SIZE) break
      }
      const sourceHash = hashPackSource(fullSource)

      saved = await this.upsertPack(
        tableName,
        langCode,
        nextPack,
        sourceHash,
      )
      await this.invalidatePackCache(tableName, langCode)

      yield {
        type: 'done',
        data: {
          tableName,
          langCode,
          skipped: false,
          translatedSegments: Object.keys(maskedDict).length,
          translatedRowCount,
          rowCount: Object.keys(nextPack).length,
          sourceRowCount: Object.keys(allSourcePack).length,
          pages: pageNo,
          version: saved?.version,
          sourceHash,
        },
      }
    } catch (e) {
      yield {
        type: 'error',
        error: {
          code: 'translateTable',
          message: e instanceof Error ? e.message : String(e),
        },
      }
    }
  }

  /**
   * 语言 Tab：一行一业务 pk，每 direct 字段一列
   * values=目标语译文；sources=对照语（默认库内中文）
   */
  async listPackEntries(
    tableName: string,
    langCode: string,
    sourceLangCode?: string,
  ) {
    const table = String(tableName || '').trim()
    const code = String(langCode || '').trim()
    if (!table) throw new CommException('tableName 不能为空')
    if (!code) {
      throw new CommException('语种不能为空')
    }
    const enabled = (await this.listEnabledFields(table)).filter(
      (f) => f.mode === 'direct' && f.enabled,
    )
    const pgTable = this.tableMap().get(table)
    const comments = pgTable ? getColumnComments(pgTable) : {}
    const pack = (await this.loadPackMap(table, code)) || {}
    const srcLang = getSourceLang()
    if (!srcLang) {
      throw new CommException('未配置 system.lang（源语言）')
    }
    const refCode = String(sourceLangCode || srcLang).trim() || srcLang
    const sourcePack =
      refCode === srcLang
        ? await this.loadSourceTextMap(table)
        : refCode === code
          ? pack
          : (await this.loadPackMap(table, refCode)) || {}

    const fieldSet = new Set(enabled.map((f) => f.fieldName))
    for (const bag of Object.values(pack)) {
      if (!bag || typeof bag !== 'object') continue
      for (const k of Object.keys(bag)) fieldSet.add(k)
    }
    const fields = [...fieldSet].map((name) => ({
      name,
      label: String(comments[name] || name),
    }))

    const list: Array<{
      id: string
      values: Record<string, string>
      sources: Record<string, string>
    }> = []
    // pack + 源表 pk 并集：无译文时也展示原数据行
    const pkSet = new Set<string>([
      ...Object.keys(pack),
      ...Object.keys(sourcePack),
    ])
    for (const pk of pkSet) {
      const bag = pack[pk]
      const values: Record<string, string> = {}
      const sources: Record<string, string> = {}
      let hasSource = false
      let hasVal = false
      for (const { name } of fields) {
        const v = String(bag?.[name] ?? '')
        const s = String(sourcePack[pk]?.[name] ?? '')
        if (v) hasVal = true
        if (s) hasSource = true
        values[name] = v
        sources[name] = s
      }
      if (!hasVal && !hasSource) continue
      list.push({ id: String(pk), values, sources })
    }
    list.sort((a, b) =>
      a.id.localeCompare(b.id, undefined, { numeric: true }),
    )
    return { fields, list }
  }

  /** 业务表当前库内原文（system.lang 源），供语言 Tab「原数据」列 */
  private async loadSourceTextMap(
    tableName: string,
  ): Promise<DataI18nPackMap> {
    const enabled = (await this.listEnabledFields(tableName)).filter(
      (f) => f.mode === 'direct',
    )
    if (!enabled.length) return {}
    const fieldNames = enabled.map((c) => c.fieldName)
    const pkField = enabled[0]?.pkField || 'id'
    const table = this.tableMap().get(tableName)
    if (!table) return {}
    const repo = this.getRepoForTable(table)
    const all: Record<string, unknown>[] = []
    let page = 1
    for (;;) {
      const { list, pagination } = await repo.findPage({
        page,
        size: DATA_I18N_PAGE_SIZE,
      })
      all.push(...(list as Record<string, unknown>[]))
      if (!list.length) break
      if (pagination.total > 0 && all.length >= pagination.total) break
      if (list.length < DATA_I18N_PAGE_SIZE) break
      page += 1
    }
    const out: DataI18nPackMap = {}
    for (const row of all) {
      const pk = String(row[pkField] ?? '')
      if (!pk) continue
      const bag: Record<string, string> = {}
      for (const field of fieldNames) {
        const raw = toDataI18nText(row[field])
        if (raw) bag[field] = raw
      }
      if (Object.keys(bag).length) out[pk] = bag
    }
    return out
  }

  async updatePackEntry(body: {
    tableName: string
    langCode: string
    id: string
    key?: string
    value?: string
    /** 整行多字段：{ fieldName: text } */
    values?: Record<string, string>
  }) {
    const tableName = String(body.tableName || '').trim()
    const langCode = String(body.langCode || '').trim()
    const pk = String(body.id ?? '').trim()
    if (!tableName || !langCode) {
      throw new CommException('tableName / langCode 无效')
    }
    if (!pk) throw new CommException('id 不能为空')
    const pack: DataI18nPackMap = {
      ...((await this.loadPackMap(tableName, langCode)) || {}),
    }
    const patch: Record<string, string> = {}
    if (body.values && typeof body.values === 'object') {
      for (const [k, v] of Object.entries(body.values)) {
        const field = String(k || '').trim()
        if (!field) continue
        patch[field] = String(v ?? '')
      }
    } else {
      const key = String(body.key || '').trim()
      if (!key) throw new CommException('key / values 不能为空')
      patch[key] = String(body.value ?? '')
    }
    if (!Object.keys(patch).length) {
      throw new CommException('无译文可保存')
    }
    const nextBag = { ...(pack[pk] || {}), ...patch }
    for (const [k, v] of Object.entries(nextBag)) {
      if (!String(v ?? '').trim()) delete nextBag[k]
    }
    if (Object.keys(nextBag).length) pack[pk] = nextBag
    else delete pack[pk]
    const saved = await this.upsertPack(tableName, langCode, pack)
    await this.invalidatePackCache(tableName, langCode)
    return { tableName, langCode, id: pk, version: saved?.version }
  }

  /** key 省略时删除该 pk 在目标语下的全部字段 */
  async deletePackEntry(body: {
    tableName: string
    langCode: string
    id: string
    key?: string
  }) {
    const tableName = String(body.tableName || '').trim()
    const langCode = String(body.langCode || '').trim()
    const pk = String(body.id ?? '').trim()
    const key = String(body.key || '').trim()
    if (!tableName || !langCode) {
      throw new CommException('tableName / langCode 无效')
    }
    if (!pk) throw new CommException('id 不能为空')
    const pack: DataI18nPackMap = {
      ...((await this.loadPackMap(tableName, langCode)) || {}),
    }
    if (pack[pk]) {
      if (!key) {
        delete pack[pk]
      } else {
        const next = { ...pack[pk] }
        delete next[key]
        if (Object.keys(next).length) pack[pk] = next
        else delete pack[pk]
      }
    }
    const saved = await this.upsertPack(tableName, langCode, pack)
    await this.invalidatePackCache(tableName, langCode)
    return { tableName, langCode, id: pk, key: key || undefined, version: saved?.version }
  }

  /**
   * 业务行硬删后：从该表所有语种 packJson 去掉对应 id（软删不调用）。
   * 由 Repository.forceDelete → registerOnForceDelete 统一触发。
   */
  async removeDeletedIdsFromPacks(
    tableName: string,
    ids: Array<string | number>,
  ) {
    const table = String(tableName || '').trim()
    if (!table || table === 'i18n_data_pack') return
    const idSet = new Set(
      ids.map((id) => String(id ?? '').trim()).filter(Boolean),
    )
    if (!idSet.size) return

    // 翻译包全局共用，不按 tenantId 过滤（与 loadPackMap 一致）
    const rows = await this.packRepo.find(
      and(
        eq(i18nDataPack.tableName, table),
        isNull(i18nDataPack.deleteTime),
      ),
    )
    for (const row of rows) {
      const langCode = String(row.langCode || '').trim()
      if (!langCode) continue
      let raw: unknown = row.packJson
      if (typeof raw === 'string') {
        try {
          raw = JSON.parse(raw)
        } catch {
          continue
        }
      }
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
      const pack: DataI18nPackMap = { ...(raw as DataI18nPackMap) }
      let changed = false
      for (const pk of idSet) {
        if (pk in pack) {
          delete pack[pk]
          changed = true
        }
      }
      if (!changed) continue
      await this.upsertPack(table, langCode, pack)
      await this.invalidatePackCache(table, langCode)
    }
  }

  private async resolveModelCode(model?: string) {
    const code = String(model || '').trim()
    if (code) return code
    const [row] = await this.modelRepo.find(
      and(eq(aiModel.status, 1), isNull(aiModel.deleteTime)),
    )
    if (!row?.code) throw new CommException('未配置可用 AI 模型')
    return row.code
  }

  /**
   * 编号行翻译：已返回的编号立刻收下；缺号只补缺，不全盘作废。
   * 补缺时把缺失项重排成 1..n 再送，回填到原 masked。
   */
  private async *translateNumberedPlainBatchWithFill(opts: {
    items: NumberedPlainItem[]
    modelCode: string
    srcLang: string
    langName: string
    langCode: string
    aiHint: string
    pageNo: number
    batchIndex: number
    batchTotal: number
    afterId: string | number | null
    maskedDict: Record<string, string>
  }): AsyncGenerator<{
    type: 'delta' | 'done' | 'error'
    text?: string
    data?: Record<string, unknown>
    error?: { code: string; message: string }
  }> {
    const {
      modelCode,
      srcLang,
      langName,
      langCode,
      aiHint,
      pageNo,
      batchIndex,
      batchTotal,
      afterId,
      maskedDict,
    } = opts

    /** 原下标 0-based → 是否已写入 maskedDict */
    const pending = opts.items
      .map((it, idx) => ({ it, idx }))
      .filter(({ it }) => !maskedDict[it.masked])

    const FILL_ROUNDS = 6
    for (let round = 0; round < FILL_ROUNDS && pending.length; round++) {
      const roundItems = pending.map((p) => p.it)
      const payloadText = formatNumberedPlainBatch(roundItems)
      const payloadLen = payloadText.length
      // 按字符估 token，留足余量，减少末尾被 max_tokens 截断导致缺号
      const maxTokens = Math.min(
        16_384,
        Math.max(2048, Math.ceil(payloadLen * 1.5)),
      )
      const out = await this.aiGateway.call(
        {
          model: modelCode,
          capability: 'chat',
          input: {
            messages: [
              {
                role: 'system',
                content: [
                  I18N_DATA_TRANSLATE_SYSTEM,
                  I18N_DATA_LINE_OUTPUT_RULES,
                  round > 0
                    ? `This is a FILL pass for missing line numbers only. Return EVERY listed N: line.`
                    : '',
                ]
                  .filter(Boolean)
                  .join('\n\n'),
              },
              {
                role: 'user',
                content: i18nDataTranslateUserContent({
                  sourceLangCode: srcLang,
                  langName,
                  langCode,
                  hint: aiHint,
                  payloadText,
                }),
              },
            ],
            max_tokens: maxTokens,
          },
          options: { stream: true },
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
            yield {
              type: 'delta',
              text: chunk.text,
              data: {
                fullText: text,
                page: pageNo,
                batch: batchIndex,
                batches: batchTotal,
                fillRound: round + 1,
                pending: pending.length,
                pageSize: DATA_I18N_PAGE_SIZE,
                afterId,
              },
            }
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
          yield {
            type: 'delta',
            text,
            data: {
              fullText: text,
              page: pageNo,
              batch: batchIndex,
              batches: batchTotal,
              fillRound: round + 1,
              pending: pending.length,
              pageSize: DATA_I18N_PAGE_SIZE,
              afterId,
            },
          }
        }
      }

      if (!text.trim()) {
        console.warn(
          `[data-i18n] numbered fill empty page=${pageNo} batch=${batchIndex} round=${round + 1} pending=${pending.length}`,
        )
        continue
      }

      const parsed = parseNumberedPlainBatchLoose(text)
      let accepted = 0
      for (let i = 0; i < pending.length; i++) {
        const lineNo = i + 1
        const v = String(parsed.get(lineNo) ?? '').trim()
        if (!v) continue
        const { it } = pending[i]!
        try {
          maskedDict[it.masked] = finalizeMaskedTranslation(it.masked, v)
          accepted++
        } catch (e) {
          console.warn(
            `[data-i18n] numbered finalize skip #${lineNo}:`,
            e instanceof Error ? e.message : e,
          )
        }
      }

      // 从 pending 去掉已收下的
      for (let i = pending.length - 1; i >= 0; i--) {
        if (maskedDict[pending[i]!.it.masked]) pending.splice(i, 1)
      }

      const missingHint = listMissingNumberedIds(parsed, roundItems.length)
      if (pending.length) {
        console.warn(
          `[data-i18n] numbered partial page=${pageNo} batch=${batchIndex} round=${round + 1} accepted=${accepted} still=${pending.length} aiMissing=${missingHint.slice(0, 8).join(',')}${missingHint.length > 8 ? '…' : ''}`,
        )
      }
    }

    if (pending.length) {
      throw new CommException(
        `AI 编号行补缺仍失败（第 ${pageNo} 页分片 ${batchIndex}/${batchTotal}）: 仍缺 ${pending.length} 条`,
      )
    }
  }

  private async upsertPack(
    tableName: string,
    langCode: string,
    packJson: DataI18nPackMap,
    sourceHash?: string,
  ) {
    const existing = await this.packRepo.findOne(
      and(
        eq(i18nDataPack.tableName, tableName),
        eq(i18nDataPack.langCode, langCode),
      ),
      { withTrashed: true, softDelete: true },
    )
    return this.packRepo.upsert({
      tableName,
      langCode,
      packJson,
      sourceHash: sourceHash || existing?.sourceHash,
      version: existing ? Number(existing.version || 1) + 1 : 1,
    })
  }
}

/** 模块加载即挂上：硬删业务行 → 清 pack（不依赖 Service 是否已首次构造） */
{
  const flag = Symbol.for('vome.i18n.onForceDeleteRegistered')
  const g = globalThis as typeof globalThis & { [flag]?: boolean }
  if (!g[flag]) {
    g[flag] = true
    registerOnForceDelete(({ tableName, ids }) =>
      Ioc.get(I18nDataService).removeDeletedIdsFromPacks(tableName, ids),
    )
  }
}
