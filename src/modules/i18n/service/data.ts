import { createHash } from 'node:crypto'
import { and, asc, eq, inArray, isNull, ne } from 'drizzle-orm'
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
  getRepository,
  hasChinese,
  Inject,
  InjectRepository,
  Ioc,
  Provide,
  registerDataI18nApplier,
  registerDataI18nFieldLoader,
  getDataI18nFieldConfigs,
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
        isNull(i18nDataField.deletedAt),
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
    if (!code || code === 'zh-CN') return null
    const cacheKey = `${normalizeTenantId(Context.get()?.tenantId)}:${tableName}:${code}`
    const hit = this.packCache.get(cacheKey)
    if (hit && Date.now() - hit.at < 30_000) return hit.pack

    const tenantId = normalizeTenantId(Context.get()?.tenantId)
    const [row] = await this.packRepo.find(
      and(
        eq(i18nDataPack.tenantId, tenantId),
        eq(i18nDataPack.tableName, tableName),
        eq(i18nDataPack.langCode, code),
        isNull(i18nDataPack.deletedAt),
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

  async modifyFieldBefore(
    data: Record<string, unknown>,
    type: 'add' | 'update' | 'delete',
  ) {
    if (type === 'delete') {
      this.invalidateFieldCache(String(data.tableName || ''))
      return
    }
    data.tenantId = normalizeTenantId(data.tenantId ?? Context.get()?.tenantId)
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
    if (type === 'add' || type === 'update') {
      await this.assertFieldUnique(tableName, fieldName, Number(data.id))
    }
    this.invalidateFieldCache(tableName)
  }

  private async assertFieldUnique(
    tableName: string,
    fieldName: string,
    id?: number,
  ) {
    const tenantId = normalizeTenantId(Context.get()?.tenantId)
    const conds = [
      eq(i18nDataField.tableName, tableName),
      eq(i18nDataField.fieldName, fieldName),
      eq(i18nDataField.tenantId, tenantId),
      isNull(i18nDataField.deletedAt),
    ]
    if (id) conds.push(ne(i18nDataField.id, id))
    const [hit] = await this.fieldRepo.find(and(...conds))
    if (hit) throw new CommException(`字段「${tableName}.${fieldName}」已配置`)
  }

  /** 列出已配置翻译字段的业务表 */
  async listDistinctTables(): Promise<string[]> {
    const tenantId = normalizeTenantId(Context.get()?.tenantId)
    const rows = await this.fieldRepo.find(
      and(eq(i18nDataField.tenantId, tenantId), isNull(i18nDataField.deletedAt)),
    )
    const set = new Set(rows.map((r) => r.tableName).filter(Boolean))
    for (const t of listDataI18nTables()) set.add(t)
    return [...set].sort()
  }

  async collectSourceRows(
    tableName: string,
    fieldNames: string[],
  ): Promise<Array<Record<string, unknown>>> {
    const table = this.tableMap().get(tableName)
    if (!table) throw new CommException(`未找到表 ${tableName}`)
    const repo = this.getRepoForTable(table)
    const deletedAt = (table as unknown as { deletedAt?: unknown }).deletedAt
    const rows = deletedAt
      ? await repo.find(isNull(deletedAt as never))
      : await repo.find()
    return (rows as Record<string, unknown>[]).filter((row) =>
      fieldNames.some((f) => {
        const val = String(row[f] ?? '').trim()
        return val && hasChinese(val)
      }),
    )
  }

  async translateTableByAi(body: {
    tableName: string
    langCode: string
    langName?: string
    mode?: 'full' | 'incremental'
    model?: string
  }) {
    const tableName = String(body.tableName || '').trim()
    const langCode = String(body.langCode || '').trim()
    if (!tableName) throw new CommException('tableName 不能为空')
    if (!langCode || langCode === 'zh-CN') {
      throw new CommException('目标语种须为非 zh-CN')
    }

    const enabled = (await this.listEnabledFields(tableName)).filter(
      (f) => f.mode === 'direct',
    )
    if (!enabled.length) {
      throw new CommException(
        `表 ${tableName} 无 direct 翻译字段（请在 Controller 声明 dataI18n 或配置业务字段）`,
      )
    }

    const fieldNames = enabled.map((c) => c.fieldName)
    const pkField = enabled[0]?.pkField || 'id'
    const rows = await this.collectSourceRows(tableName, fieldNames)

    const segmentSet = new Set<string>()
    const sourcePack: DataI18nPackMap = {}
    for (const row of rows) {
      const pk = String(row[pkField] ?? '')
      if (!pk) continue
      const bag: Record<string, string> = {}
      for (const field of fieldNames) {
        const raw = String(row[field] ?? '').trim()
        if (!raw || !hasChinese(raw)) continue
        bag[field] = raw
        for (const seg of extractChineseSegments(raw)) segmentSet.add(seg)
      }
      if (Object.keys(bag).length) sourcePack[pk] = bag
    }

    const incremental = body.mode !== 'full'
    const existing =
      (await this.loadPackMap(tableName, langCode)) ||
      ({} as DataI18nPackMap)

    const newSourceHash = hashPackSource(sourcePack)
    if (incremental) {
      const tenantId = normalizeTenantId(Context.get()?.tenantId)
      const [packRow] = await this.packRepo.find(
        and(
          eq(i18nDataPack.tenantId, tenantId),
          eq(i18nDataPack.tableName, tableName),
          eq(i18nDataPack.langCode, langCode),
          isNull(i18nDataPack.deletedAt),
        ),
      )
      if (packRow?.sourceHash === newSourceHash) {
        return {
          tableName,
          langCode,
          skipped: true,
          message: '源数据未变化，跳过增量翻译',
          rowCount: Object.keys(existing).length,
          version: packRow.version,
        }
      }
    }

    const toTranslate = new Set<string>()
    for (const seg of segmentSet) {
      if (!incremental) {
        toTranslate.add(seg)
        continue
      }
      let covered = false
      outer: for (const bag of Object.values(existing)) {
        for (const val of Object.values(bag)) {
          const rebuilt = applyChineseSegmentMap(val, { [seg]: seg })
          if (rebuilt !== val) {
            covered = true
            break outer
          }
        }
      }
      if (!covered) toTranslate.add(seg)
    }

    const langName =
      body.langName ||
      (
        await this.langRepo.find(
          and(eq(i18nLang.code, langCode), isNull(i18nLang.deletedAt)),
        )
      )[0]?.name ||
      langCode

    const segmentDict: Record<string, string> = {}
    if (toTranslate.size) {
      const modelCode = await this.resolveModelCode(body.model)
      const payload: Record<string, string> = {}
      for (const seg of toTranslate) payload[seg] = seg
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
            throw new CommException(chunk.error?.message || 'AI 翻译失败')
          }
          if (chunk.type === 'delta' && chunk.text) text += chunk.text
          if (chunk.type === 'done') {
            text = String(chunk.text || chunk.data?.text || text)
          }
        }
      } else {
        if (!out.ok) throw new CommException(out.error?.message || 'AI 翻译失败')
        text = String((out.data as { text?: string } | undefined)?.text || '')
      }
      const parsed = extractJsonObject(text) as Record<string, string>
      for (const [k, v] of Object.entries(parsed)) {
        if (toTranslate.has(k) && String(v || '').trim()) {
          segmentDict[k] = String(v).trim()
        }
      }
    }

    const nextPack: DataI18nPackMap = incremental ? { ...existing } : {}
    for (const pk of Object.keys(nextPack)) {
      if (!(pk in sourcePack)) delete nextPack[pk]
    }
    for (const [pk, bag] of Object.entries(sourcePack)) {
      const translated: Record<string, string> = {}
      for (const [field, raw] of Object.entries(bag)) {
        translated[field] = applyChineseSegmentMap(raw, segmentDict)
      }
      nextPack[pk] = { ...(nextPack[pk] || {}), ...translated }
    }

    const sourceHash = hashPackSource(sourcePack)
    const saved = await this.upsertPack(tableName, langCode, nextPack, sourceHash)
    this.invalidatePackCache(tableName, langCode)
    return {
      tableName,
      langCode,
      translatedSegments: Object.keys(segmentDict).length,
      rowCount: Object.keys(nextPack).length,
      version: saved?.version,
    }
  }

  private async resolveModelCode(model?: string) {
    const code = String(model || '').trim()
    if (code) return code
    const [row] = await this.modelRepo.find(
      and(eq(aiModel.status, 1), isNull(aiModel.deletedAt)),
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
      if (existing.deletedAt) {
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
