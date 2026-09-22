import type { CrudModifyType } from '@core/server'
import { and, eq, isNull } from 'drizzle-orm'
import {
  BaseService,
  CommException,
  InjectRepository,
  Provide,
  type Repository,
} from '@core/server'
import { aiModel } from '../entity/model'
import {
  normalizeAiContentType,
  requireAsyncSpec,
  type AiAsyncSpec,
} from 'vome-core/ai'

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

  private async prepareModel(
    data: Record<string, unknown>,
    type: 'add' | 'update',
  ) {
    if (data.code != null) data.code = String(data.code).trim()
    if (data.path != null) {
      const path = String(data.path).trim()
      data.path = path.startsWith('/') ? path : `/${path}`
    }
    if (data.method != null) {
      const method = String(data.method).trim().toUpperCase()
      const allowed = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
      if (!allowed.has(method)) throw new CommException('请求方法不合法')
      data.method = method
    }
    if (data.contentType != null) {
      data.contentType = normalizeAiContentType(data.contentType)
    }
    // 局部更新（如表格开关）勿默认覆盖 capabilities / resultModes
    if (type === 'add' || data.capabilities !== undefined) {
      if (!Array.isArray(data.capabilities)) data.capabilities = []
    }
    if (type === 'add' || data.resultModes !== undefined) {
      if (
        !Array.isArray(data.resultModes) ||
        !(data.resultModes as unknown[]).length
      ) {
        data.resultModes = ['sync']
      }
    }
    if (
      type === 'add' ||
      data.asyncSpec !== undefined ||
      data.resultModes !== undefined
    ) {
      const modes = data.resultModes
      const needAsync =
        Array.isArray(modes) && (modes as string[]).includes('async')
      data.asyncSpec = normalizeAsyncSpec(data.asyncSpec, needAsync)
    }
    // code 唯一靠 uniqueIndex；软删 add 撞键由 Repository upsert
  }

  async modifyBefore(data: unknown, type: CrudModifyType) {
    if (type !== 'add' && type !== 'update') return
    const rows = Array.isArray(data) ? data : [data]
    for (const raw of rows) {
      if (raw == null || typeof raw !== 'object') continue
      await this.prepareModel(
        raw as Record<string, unknown>,
        type as 'add' | 'update',
      )
    }
  }

  async findEnabledByCode(code: string) {
    const [row] = await this.modelRepo.find(
      and(
        eq(aiModel.code, code),
        eq(aiModel.status, 1),
        isNull(aiModel.deleteTime),
      ),
    )
    return row
  }
}
