import { and, eq, isNull, ne } from 'drizzle-orm'
import {
  BaseService,
  CommException,
  Context,
  InjectRepository,
  Provide,
  type Repository,
} from '/#/server'
import { aiModel } from '../entity/model'
import {
  normalizeAiContentType,
  requireAsyncSpec,
  type AiAsyncSpec,
  type AiInputSchema,
  type AiResponseSpec,
} from '../lib/ai/types'

function normalizeTenantId(raw: unknown): number {
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : 0
}

function normalizeInputSchema(raw: unknown): AiInputSchema | null {
  if (raw == null || raw === '') return null
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new CommException('inputSchema 须为对象，形如 { fields: [...] }')
  }
  const fields = (raw as { fields?: unknown }).fields
  if (fields == null) return { fields: [] }
  if (!Array.isArray(fields)) {
    throw new CommException('inputSchema.fields 须为数组')
  }
  return { fields: fields as AiInputSchema['fields'] }
}

function normalizeAsyncSpec(
  raw: unknown,
  requirePoll: boolean,
): AiAsyncSpec | null {
  if (raw == null || raw === '') {
    if (requirePoll) {
      throw new CommException(
        '结果形态含 async 时必须配置 asyncSpec.pollPath',
      )
    }
    return null
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new CommException('asyncSpec 须为对象')
  }
  const spec = raw as AiAsyncSpec
  if (requirePoll) {
    try {
      return requireAsyncSpec(spec)
    } catch (e) {
      throw new CommException(e instanceof Error ? e.message : String(e))
    }
  }
  const pollPath = String(spec.pollPath ?? '').trim()
  if (!pollPath) return { ...spec, pollPath: '' }
  return {
    ...spec,
    pollPath: pollPath.startsWith('/') ? pollPath : `/${pollPath}`,
  }
}

function normalizeResponseSpec(raw: unknown): AiResponseSpec | null {
  if (raw == null || raw === '') return null
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new CommException('responseSpec 须为对象')
  }
  return raw as AiResponseSpec
}

@Provide()
export class AiModelService extends BaseService {
  @InjectRepository(aiModel)
  modelRepo: Repository<typeof aiModel>

  private async assertCodeUnique(code: string, id?: number) {
    const tenantId = normalizeTenantId(Context.get()?.tenantId)
    const conds = [
      eq(aiModel.code, code),
      eq(aiModel.tenantId, tenantId),
      isNull(aiModel.deletedAt),
    ]
    if (id != null) conds.push(ne(aiModel.id, id))
    const [hit] = await this.modelRepo.find(and(...conds))
    if (hit) throw new CommException(`模型编码「${code}」在当前租户已存在`)
  }

  async modifyBefore(
    data: Record<string, unknown>,
    type: 'add' | 'update' | 'delete',
  ) {
    if (type !== 'add' && type !== 'update') return
    data.tenantId = normalizeTenantId(
      data.tenantId ?? Context.get()?.tenantId,
    )
    const code = String(data.code ?? '').trim()
    if (!code) throw new CommException('模型编码不能为空')
    data.code = code
    const path = String(data.path ?? '').trim()
    if (!path) throw new CommException('请求路径不能为空')
    data.path = path.startsWith('/') ? path : `/${path}`
    const method = String(data.method ?? 'POST').trim().toUpperCase()
    const allowed = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
    if (!allowed.has(method)) throw new CommException('请求方法不合法')
    data.method = method
    data.contentType = normalizeAiContentType(data.contentType)
    if (!Array.isArray(data.capabilities)) data.capabilities = []
    if (
      !Array.isArray(data.resultModes) ||
      !(data.resultModes as unknown[]).length
    ) {
      data.resultModes = ['sync']
    }
    const needAsync = (data.resultModes as string[]).includes('async')
    data.asyncSpec = normalizeAsyncSpec(data.asyncSpec, needAsync)
    data.inputSchema = normalizeInputSchema(data.inputSchema)
    data.responseSpec = normalizeResponseSpec(data.responseSpec)
    if (data.validateInput != null) {
      data.validateInput = Number(data.validateInput) === 1 ? 1 : 0
    }
    await this.assertCodeUnique(
      code,
      type === 'update' && data.id != null ? Number(data.id) : undefined,
    )
  }

  async findEnabledByCode(code: string) {
    const tenantId = normalizeTenantId(Context.get()?.tenantId)
    const [row] = await this.modelRepo.find(
      and(
        eq(aiModel.code, code),
        eq(aiModel.tenantId, tenantId),
        eq(aiModel.status, 1),
        isNull(aiModel.deletedAt),
      ),
    )
    return row
  }

  /** 启用模型目录（含参数提示 / 响应映射，供前端 service 链消费） */
  async listCatalog() {
    const tenantId = normalizeTenantId(Context.get()?.tenantId)
    const rows = await this.modelRepo.find(
      and(
        eq(aiModel.status, 1),
        eq(aiModel.tenantId, tenantId),
        isNull(aiModel.deletedAt),
      ),
    )
    return rows.map((row) => ({
      code: row.code,
      path: row.path,
      method: row.method,
      contentType: row.contentType,
      capabilities: row.capabilities,
      resultModes: row.resultModes,
      inputSchema: row.inputSchema,
      responseSpec: row.responseSpec,
      asyncSpec: row.asyncSpec,
      defaults: row.defaults,
    }))
  }
}
