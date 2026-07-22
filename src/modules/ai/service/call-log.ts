import { and, eq, inArray, isNull } from 'drizzle-orm'
import {
  BaseService,
  InjectRepository,
  Provide,
  type Repository,
} from '/#/server'
import { aiCallLog } from '../entity/call-log'

export type AiCallLogInput = {
  modelCode?: string
  capability: string
  mode: string
  ok: boolean
  latencyMs?: number
  usage?: {
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
  }
  error?: { code: string; message: string }
  source?: string
  request?: Record<string, unknown> | null
  result?: Record<string, unknown> | null
}

export type AiAsyncRecordInput = {
  recordKey: string
  modelCode: string
  capability: string
  status: string
  upstreamId: string
  request: Record<string, unknown>
  result?: Record<string, unknown> | null
  source?: string
  ok?: boolean
}

/** 调用记录：请求快照（模型 / 能力 / input） */
export function buildAiCallLogRequest(
  modelCode: string,
  capability: string,
  input: Record<string, unknown> | null | undefined,
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    model: modelCode,
    capability,
    input: input ?? {},
    ...extra,
  }
}

/** 调用记录：响应快照（data / usage / error / raw） */
export function buildAiCallLogResult(payload: {
  ok: boolean
  data?: Record<string, unknown> | null
  usage?: Record<string, unknown> | null
  error?: { code: string; message: string } | null
  raw?: unknown
}): Record<string, unknown> {
  const out: Record<string, unknown> = { ok: payload.ok }
  if (payload.data != null) out.data = payload.data
  if (payload.usage != null) out.usage = payload.usage
  if (payload.error) out.error = payload.error
  if (payload.raw != null) out.raw = payload.raw
  return out
}

@Provide()
export class AiCallLogService extends BaseService {
  @InjectRepository(aiCallLog)
  logRepo: Repository<typeof aiCallLog>

  async write(entry: AiCallLogInput) {
    await this.logRepo.create({
      modelCode: entry.modelCode ?? null,
      capability: entry.capability,
      mode: entry.mode,
      ok: entry.ok ? 1 : 0,
      latencyMs: entry.latencyMs ?? null,
      inputTokens: entry.usage?.inputTokens ?? null,
      outputTokens: entry.usage?.outputTokens ?? null,
      totalTokens: entry.usage?.totalTokens ?? null,
      errorCode: entry.error?.code ?? null,
      errorMessage: entry.error?.message ?? null,
      source: entry.source ?? 'gateway',
      request: entry.request ?? null,
      result: entry.result ?? null,
    })
  }

  async createAsyncRecord(entry: AiAsyncRecordInput) {
    await this.logRepo.create({
      recordKey: entry.recordKey,
      modelCode: entry.modelCode,
      capability: entry.capability,
      mode: 'async',
      status: entry.status,
      ok: entry.ok === false ? 0 : 1,
      upstreamId: entry.upstreamId,
      request: entry.request,
      result: entry.result ?? null,
      source: entry.source ?? 'gateway',
    })
  }

  async findByRecordKey(recordKey: string) {
    const [row] = await this.logRepo.find(
      and(eq(aiCallLog.recordKey, recordKey), isNull(aiCallLog.deletedAt)),
    )
    return row ?? null
  }

  async updateByRecordKey(
    recordKey: string,
    patch: Partial<typeof aiCallLog.$inferInsert>,
  ) {
    const row = await this.findByRecordKey(recordKey)
    if (!row) return null
    await this.logRepo.update(eq(aiCallLog.id, row.id), patch)
    return this.findByRecordKey(recordKey)
  }

  async listStaleAsync(timeoutMs: number) {
    return this.logRepo.find(
      and(
        eq(aiCallLog.mode, 'async'),
        inArray(aiCallLog.status, ['pending', 'running']),
        isNull(aiCallLog.deletedAt),
      ),
    ).then((rows) => {
      const now = Date.now()
      return rows.filter((row) => {
        const created = row.createTime
          ? new Date(String(row.createTime)).getTime()
          : 0
        return created > 0 && now - created >= timeoutMs
      })
    })
  }
}
