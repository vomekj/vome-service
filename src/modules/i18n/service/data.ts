import { createHash } from 'node:crypto'
import { and, asc, eq, gt, inArray, isNull, ne } from 'drizzle-orm'
import { getTableName, isTable, type Table } from 'drizzle-orm'
import {
  applyChineseSegmentMap,
  applyDataI18nDefault,
  BaseService,
  CommException,
  Context,
  DbStore,
  extractChineseSegments,
  extractJsonObject,
  getColumnComments,
  getRepository,
  hasChinese,
  Inject,
  InjectRepository,
  Ioc,
  Provide,
  registerDataI18nApplier,
  registerDataI18nFieldLoader,
  getDataI18nFieldConfigs,
  getDataI18nSeeds,
  resolveDataI18nSeedField,
  listDataI18nTables,
  type DataI18nFieldConfig,
  type DataI18nPackMap,
  type Repository,
} from '@core/server'
import { AiGateway } from '../../ai/service/gateway'
import { aiModel } from '../../ai/entity/model'
import { i18nLang } from '../entity/lang'
import { i18nDataField } from '../entity/data-field'
import { i18nDataPack } from '../entity/data-pack'

function normalizeTenantId(raw: unknown): number {
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : 0
}

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

/** 该字段是否仍需翻译（缺译文 / 仍等于原文 / 译文里还留着源中文片段） */
function fieldNeedsTranslate(
  raw: string,
  prev: string | undefined,
  seedValue?: string,
): boolean {
  const seed = String(seedValue || '').trim()
  if (seed) {
    if (prev === seed) return false
    if (!prev || !String(prev).trim() || prev === raw) return true
    return prev !== seed
  }
  if (!prev || !String(prev).trim()) return true
  if (prev === raw) return true
  for (const seg of extractChineseSegments(raw)) {
    if (prev.includes(seg)) return true
  }
  return false
}

function buildTableMap(schema: Record<string, unknown>): Map<string, Table> {
  const map = new Map<string, Table>()
  for (const value of Object.values(schema)) {
    if (isTable(value)) map.set(getTableName(value), value)
  }
  return map
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

  private fieldCache = new Map<string, { at: number; rows: DataI18nFieldConfig[] }>()
  private packCache = new Map<string, { at: number; pack: DataI18nPackMap }>()
  private static registered = false

  constructor() {
    super()
    if (!I18nDataService.registered) {
      I18nDataService.registered = true
      registerDataI18nFieldLoader((tableName) => this.listEnabledFields(tableName))
      registerDataI18nApplier(async (rows, ctx) =>
        applyDataI18nDefault(rows, {
          ...ctx,
          loadPack: (table) => this.loadPackMap(table, ctx.langCode),
          resolveSourcePk: (input) => this.resolveSourcePk(input),
        }),
      )
    }
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

  async listEnabledFields(tableName: string): Promise<DataI18nFieldConfig[]> {
    const key = `${normalizeTenantId(Context.get()?.tenantId)}:${tableName}`
    const hit = this.fieldCache.get(key)
    if (hit && Date.now() - hit.at < 30_000) return hit.rows

    const tenantId = normalizeTenantId(Context.get()?.tenantId)
    const rows = await this.fieldRepo.find(
      and(
        eq(i18nDataField.tenantId, tenantId),
        eq(i18nDataField.tableName, tableName),
        eq(i18nDataField.status, 1),
        isNull(i18nDataField.deleteTime),
      ),
      { orderBy: [asc(i18nDataField.id)] },
    )
    const fromDb = rows.map((r) => this.rowToFieldConfig(r))
    const fromDecl = getDataI18nFieldConfigs(tableName)
    const merged = new Map<string, DataI18nFieldConfig>()
    for (const f of fromDb) merged.set(f.fieldName, f)
    for (const f of fromDecl) merged.set(f.fieldName, f)
    const out = [...merged.values()]
    this.fieldCache.set(key, { at: Date.now(), rows: out })
    return out
  }

  invalidateFieldCache(tableName?: string) {
    if (!tableName) {
      this.fieldCache.clear()
      return
    }
    const tenantId = normalizeTenantId(Context.get()?.tenantId)
    this.fieldCache.delete(`${tenantId}:${tableName}`)
  }

  invalidatePackCache(tableName?: string, langCode?: string) {
    if (!tableName) {
      this.packCache.clear()
      return
    }
    const tenantId = normalizeTenantId(Context.get()?.tenantId)
    const prefix = `${tenantId}:${tableName}:`
    for (const key of this.packCache.keys()) {
      if (!key.startsWith(prefix)) continue
      if (langCode && !key.endsWith(`:${langCode}`)) continue
      this.packCache.delete(key)
    }
  }

  async loadPackMap(
    tableName: string,
    langCode: string,
  ): Promise<DataI18nPackMap | null> {
    const code = String(langCode || '').trim()
    if (!code) return null
    const cacheKey = `${normalizeTenantId(Context.get()?.tenantId)}:${tableName}:${code}`
    const hit = this.packCache.get(cacheKey)
    if (hit && Date.now() - hit.at < 30_000) return hit.pack

    const tenantId = normalizeTenantId(Context.get()?.tenantId)
    const [row] = await this.packRepo.find(
      and(
        eq(i18nDataPack.tenantId, tenantId),
        eq(i18nDataPack.tableName, tableName),
        eq(i18nDataPack.langCode, code),
        isNull(i18nDataPack.deleteTime),
      ),
    )
    const pack = (row?.packJson as DataI18nPackMap | undefined) || {}
    this.packCache.set(cacheKey, { at: Date.now(), pack })
    return pack
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

  async assertFieldUnique(
    tableName: string,
    fieldName: string,
    id?: number,
  ) {
    const tenantId = normalizeTenantId(Context.get()?.tenantId)
    const conds = [
      eq(i18nDataField.tableName, tableName),
      eq(i18nDataField.fieldName, fieldName),
      eq(i18nDataField.tenantId, tenantId),
      isNull(i18nDataField.deleteTime),
    ]
    if (id) conds.push(ne(i18nDataField.id, id))
    const [hit] = await this.fieldRepo.find(and(...conds))
    if (hit) throw new CommException(`字段「${tableName}.${fieldName}」已配置`)
  }

  /** 列出已配置翻译字段的业务表 */
  async listDistinctTables(): Promise<string[]> {
    const tenantId = normalizeTenantId(Context.get()?.tenantId)
    const rows = await this.fieldRepo.find(
      and(eq(i18nDataField.tenantId, tenantId), isNull(i18nDataField.deleteTime)),
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
    const repo = this.getRepoForTable(opts.table)
    const idCol = this.pkColumn(opts.table, opts.pkField)
    const where =
      opts.afterId != null && opts.afterId !== ''
        ? gt(idCol as never, opts.afterId as never)
        : undefined
    const { list } = await repo.findPage({
      page: 1,
      size: opts.size,
      where,
      orderBy: [asc(idCol as never)],
    })
    return list as Record<string, unknown>[]
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
      const raw = String(row[field] ?? '').trim()
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

  async collectSourceRows(
    tableName: string,
    fieldNames: string[],
  ): Promise<Array<Record<string, unknown>>> {
    const table = this.tableMap().get(tableName)
    if (!table) throw new CommException(`未找到表 ${tableName}`)
    const pkField = 'id'
    const all: Record<string, unknown>[] = []
    let afterId: string | number | null = null
    for (;;) {
      const list = await this.fetchRowsAfterId({
        table,
        pkField,
        afterId,
        size: DATA_I18N_PAGE_SIZE,
      })
      if (!list.length) break
      all.push(...list)
      afterId = this.coercePk(list[list.length - 1]?.[pkField])
      if (list.length < DATA_I18N_PAGE_SIZE) break
    }
    return all.filter((row) =>
      fieldNames.some((f) => {
        const val = String(row[f] ?? '').trim()
        return val && hasChinese(val)
      }),
    )
  }

  /**
   * AI 翻译业务表（SSE）
   * 每查 100 行 → 筛中文 → 送 AI → 落库，再翻下一批；增量从首个未译完 id 继续。
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

      let nextPack: DataI18nPackMap = incremental
        ? {
            ...((await this.loadPackMap(tableName, langCode)) || {}),
          }
        : {}

      const langName =
        body.langName ||
        (
          await this.langRepo.find(
            and(eq(i18nLang.code, langCode), isNull(i18nLang.deleteTime)),
          )
        )[0]?.name ||
        langCode

      let afterId: string | number | null = null
      if (incremental) {
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
            },
          }
          return
        }
      }

      let modelCode = ''
      /** 跨页复用已译片段，避免「是/否」每页重复打 AI */
      const segmentDict: Record<string, string> = {}
      const allSourcePack: DataI18nPackMap = {}
      let translatedRowCount = 0
      let pageNo = 0
      let saved: { version?: number } | undefined

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

        const pageSegs = new Set<string>()
        for (const { bag, row } of pageBags) {
          for (const [field, raw] of Object.entries(bag)) {
            const seedFrom = resolveDataI18nSeedField(seeds, field, langCode)
            const seedVal = seedFrom
              ? String(row[seedFrom] ?? '').trim()
              : ''
            if (seedVal) continue
            for (const seg of extractChineseSegments(raw)) {
              if (!segmentDict[seg]) pageSegs.add(seg)
            }
          }
        }

        if (pageSegs.size) {
          if (!modelCode) {
            modelCode = await this.resolveModelCode(body.model)
          }
          const payload: Record<string, string> = {}
          for (const seg of pageSegs) payload[seg] = seg
          const out = await this.aiGateway.call(
            {
              model: modelCode,
              capability: 'chat',
              input: {
                messages: [
                  {
                    role: 'system',
                    content:
                      'You are a professional game/item name translator. Translate ONLY the Chinese string values in the JSON object. Keep keys unchanged. Do not translate Latin letters, numbers, or symbols. Output a single JSON object only.',
                  },
                  {
                    role: 'user',
                    content: `Translate these Chinese fragments from Simplified Chinese (zh-CN) into ${langName} (${langCode}). Return JSON with the same keys.\n\n${JSON.stringify(payload, null, 2)}`,
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
                yield {
                  type: 'delta',
                  text: chunk.text,
                  data: {
                    fullText: text,
                    page: pageNo,
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
                  pageSize: DATA_I18N_PAGE_SIZE,
                  afterId,
                },
              }
            }
          }
          if (!text.trim()) {
            throw new CommException(`AI 未返回翻译内容（第 ${pageNo} 批）`)
          }
          const parsed = extractJsonObject(text) as Record<string, string>
          for (const [k, v] of Object.entries(parsed)) {
            if (pageSegs.has(k) && String(v || '').trim()) {
              segmentDict[k] = String(v).trim()
            }
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
              !fieldNeedsTranslate(raw, prev, seedVal || undefined)
            ) {
              translated[field] = String(prev)
              continue
            }
            if (seedVal) {
              translated[field] = seedVal
              continue
            }
            translated[field] = applyChineseSegmentMap(raw, segmentDict)
          }
          nextPack[pk] = { ...(nextPack[pk] || {}), ...translated }
          translatedRowCount += 1
        }

        // 每批落库，中断后增量可从断点续
        saved = await this.upsertPack(tableName, langCode, nextPack)
        this.invalidatePackCache(tableName, langCode)

        afterId = this.coercePk(list[list.length - 1]?.[pkField])
        if (list.length < DATA_I18N_PAGE_SIZE) break
      }

      // 全量：删掉源里已不存在的旧 pk
      if (!incremental) {
        for (const pk of Object.keys(nextPack)) {
          if (!(pk in allSourcePack)) delete nextPack[pk]
        }
      }

      // 仅当已无待译行时写最终 sourceHash（增量断点续跑不能用「本趟片段」当全量 hash）
      let sourceHash: string | undefined
      const left = await this.findIncrementalCursor({
        table,
        pkField,
        fieldNames,
        existing: nextPack,
        langCode,
        seeds,
      })
      if (left.done) {
        const fullSource: DataI18nPackMap = {}
        let scanAfter: string | number | null = null
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
            if (built) fullSource[built.pk] = built.bag
          }
          scanAfter = this.coercePk(scanList[scanList.length - 1]?.[pkField])
          if (scanList.length < DATA_I18N_PAGE_SIZE) break
        }
        sourceHash = hashPackSource(fullSource)
      }

      saved = await this.upsertPack(
        tableName,
        langCode,
        nextPack,
        sourceHash,
      )
      this.invalidatePackCache(tableName, langCode)

      yield {
        type: 'done',
        data: {
          tableName,
          langCode,
          skipped: false,
          translatedSegments: Object.keys(segmentDict).length,
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

  async translateTableByAi(
    body: Parameters<I18nDataService['translateTableByAiStream']>[0],
  ) {
    let result: Record<string, unknown> | undefined
    for await (const chunk of this.translateTableByAiStream(body)) {
      if (chunk.type === 'error') {
        throw new CommException(chunk.error?.message || 'AI 翻译失败')
      }
      if (chunk.type === 'done') {
        result = chunk.data
      }
    }
    if (!result) throw new CommException('AI 未返回翻译内容')
    return result
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
    const refCode = String(sourceLangCode || 'zh-CN').trim() || 'zh-CN'
    const sourcePack =
      !refCode || refCode === 'zh-CN'
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
    for (const [pk, bag] of Object.entries(pack)) {
      if (!bag || typeof bag !== 'object') continue
      const values: Record<string, string> = {}
      const sources: Record<string, string> = {}
      let hasVal = false
      for (const { name } of fields) {
        const v = String(bag[name] ?? '')
        if (v) hasVal = true
        values[name] = v
        sources[name] = String(sourcePack[pk]?.[name] ?? '')
      }
      if (!hasVal) continue
      list.push({ id: String(pk), values, sources })
    }
    list.sort((a, b) =>
      a.id.localeCompare(b.id, undefined, { numeric: true }),
    )
    return { fields, list }
  }

  /** 业务表当前库内原文（中文源），供语言 Tab「原数据」列 */
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
        const raw = String(row[field] ?? '')
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
    this.invalidatePackCache(tableName, langCode)
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
    this.invalidatePackCache(tableName, langCode)
    return { tableName, langCode, id: pk, key: key || undefined, version: saved?.version }
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

  private async upsertPack(
    tableName: string,
    langCode: string,
    packJson: DataI18nPackMap,
    sourceHash?: string,
  ) {
    const tenantId = normalizeTenantId(Context.get()?.tenantId)
    const [existing] = await this.packRepo.find(
      and(
        eq(i18nDataPack.tenantId, tenantId),
        eq(i18nDataPack.tableName, tableName),
        eq(i18nDataPack.langCode, langCode),
      ),
      { withTrashed: true },
    )
    if (existing) {
      if (existing.deleteTime) {
        await this.packRepo.restore(eq(i18nDataPack.id, existing.id))
      }
      await this.packRepo.update(eq(i18nDataPack.id, existing.id), {
        packJson,
        version: Number(existing.version || 1) + 1,
        sourceHash: sourceHash || existing.sourceHash,
      })
      const [row] = await this.packRepo.find(eq(i18nDataPack.id, existing.id))
      return row
    }
    await this.packRepo.create({
      tenantId,
      tableName,
      langCode,
      packJson,
      version: 1,
      sourceHash,
    })
    const [row] = await this.packRepo.find(
      and(
        eq(i18nDataPack.tenantId, tenantId),
        eq(i18nDataPack.tableName, tableName),
        eq(i18nDataPack.langCode, langCode),
      ),
    )
    return row
  }
}
