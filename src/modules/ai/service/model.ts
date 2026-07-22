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

function normalizeTenantId(raw: unknown): number {
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : 0
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
    if (!Array.isArray(data.capabilities)) data.capabilities = []
    if (
      !Array.isArray(data.resultModes) ||
      !(data.resultModes as unknown[]).length
    ) {
      data.resultModes = ['sync']
    }
    if (typeof data.paths === 'string') {
      const raw = data.paths.trim()
      if (!raw) data.paths = null
      else {
        try {
          data.paths = JSON.parse(raw)
        } catch {
          throw new CommException('路径覆盖须为合法 JSON 对象')
        }
      }
    }
    if (
      data.paths != null &&
      (typeof data.paths !== 'object' || Array.isArray(data.paths))
    ) {
      throw new CommException('路径覆盖须为对象')
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
}
