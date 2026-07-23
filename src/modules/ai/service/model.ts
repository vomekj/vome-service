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
} from '../lib/ai/types'

function normalizeTenantId(raw: unknown): number {
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : 0
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
}
