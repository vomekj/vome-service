import { and, eq, isNull } from 'drizzle-orm'
import {
  BaseService,
  CommException,
  InjectRepository,
  Provide,
  getEnv,
  type Repository,
} from '@core/server'
import { decryptSecret, encryptSecret } from '../../../lib/secret-box'
import { projectAiModel } from '../entity/project-ai-model'

@Provide()
export class ProjectAiModelService extends BaseService {
  @InjectRepository(projectAiModel)
  modelRepo: Repository<typeof projectAiModel>

  private assertDev() {
    if (getEnv() !== 'dev') {
      throw new CommException('自接模型仅开发模式可用')
    }
  }

  private normalizeCode(raw: string) {
    let code = String(raw || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_.:-]+/g, '-')
      .slice(0, 100)
    if (!code) throw new CommException('模型编码无效')
    if (!code.startsWith('custom:')) code = `custom:${code}`
    return code
  }

  /** 列表永不返回明文密钥；解密仅 resolveForCall（且控制器限 dev） */
  async listByProject(projectId: number) {
    const pid = Number(projectId)
    if (!(pid > 0)) throw new CommException('项目 ID 无效')
    const rows = await this.modelRepo.find(
      and(
        eq(projectAiModel.projectId, pid),
        eq(projectAiModel.status, 1),
        isNull(projectAiModel.deletedTime),
      ),
    )
    return rows.map((r) => ({
      id: r.id,
      projectId: r.projectId,
      code: r.code,
      name: r.name,
      baseUrl: r.baseUrl,
      capabilities: r.capabilities,
      remark: r.remark,
      status: r.status,
      hasKey: Boolean(r.apiKeyEnc),
    }))
  }

  async create(body: {
    projectId: number
    code?: string
    name?: string
    baseUrl?: string
    apiKey?: string
    capabilities?: string[]
    remark?: string
  }) {
    this.assertDev()
    const projectId = Number(body.projectId)
    if (!(projectId > 0)) throw new CommException('项目 ID 无效')
    const code = this.normalizeCode(String(body.code || body.name || ''))
    const name = String(body.name || '').trim() || code
    const baseUrl = String(body.baseUrl || '').trim().replace(/\/$/, '')
    if (!baseUrl) throw new CommException('baseUrl 不能为空')
    const apiKey = String(body.apiKey || '').trim()
    if (!apiKey) throw new CommException('apiKey 不能为空')
    const dup = await this.modelRepo.findOne(
      and(
        eq(projectAiModel.projectId, projectId),
        eq(projectAiModel.code, code),
        isNull(projectAiModel.deletedTime),
      ),
    )
    if (dup) throw new CommException('模型编码已存在')
    const caps = Array.isArray(body.capabilities)
      ? body.capabilities.map(String)
      : ['chat']
    const row = await this.modelRepo.create({
      projectId,
      code,
      name,
      baseUrl,
      apiKeyEnc: encryptSecret(apiKey),
      capabilities: caps.length ? caps : ['chat'],
      remark: String(body.remark || '').trim() || null,
      status: 1,
    })
    return Array.isArray(row) ? row[0] : row
  }

  async update(body: {
    id: number
    name?: string
    baseUrl?: string
    apiKey?: string
    capabilities?: string[]
    remark?: string
    status?: number
  }) {
    this.assertDev()
    const id = Number(body.id)
    if (!(id > 0)) throw new CommException('模型 ID 无效')
    const row = await this.modelRepo.findOne(
      and(eq(projectAiModel.id, id), isNull(projectAiModel.deletedTime)),
    )
    if (!row) throw new CommException('模型不存在')
    const patch: Record<string, unknown> = {}
    if (body.name !== undefined) patch.name = String(body.name || '').trim()
    if (body.baseUrl !== undefined) {
      patch.baseUrl = String(body.baseUrl || '')
        .trim()
        .replace(/\/$/, '')
    }
    if (body.apiKey !== undefined && String(body.apiKey).trim()) {
      patch.apiKeyEnc = encryptSecret(String(body.apiKey).trim())
    }
    if (body.capabilities !== undefined) {
      patch.capabilities = Array.isArray(body.capabilities)
        ? body.capabilities.map(String)
        : ['chat']
    }
    if (body.remark !== undefined) {
      patch.remark = String(body.remark || '').trim() || null
    }
    if (body.status !== undefined) patch.status = Number(body.status) ? 1 : 0
    if (!Object.keys(patch).length) throw new CommException('没有可更新的字段')
    await this.modelRepo.update(eq(projectAiModel.id, id), patch)
    return this.modelRepo.findOne(eq(projectAiModel.id, id))
  }

  async remove(idRaw: number) {
    this.assertDev()
    const id = Number(idRaw)
    if (!(id > 0)) throw new CommException('模型 ID 无效')
    await this.modelRepo.softDelete(id)
    return { id }
  }

  /** agent 调自接模型时取完整配置（含解密密钥）；仅开发模式 */
  async resolveForCall(projectId: number, code: string) {
    this.assertDev()
    const pid = Number(projectId)
    const c = this.normalizeCode(code)
    const row = await this.modelRepo.findOne(
      and(
        eq(projectAiModel.projectId, pid),
        eq(projectAiModel.code, c),
        eq(projectAiModel.status, 1),
        isNull(projectAiModel.deletedTime),
      ),
    )
    if (!row) throw new CommException('自接模型不存在')
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      baseUrl: row.baseUrl,
      apiKey: decryptSecret(String(row.apiKeyEnc || '')),
      capabilities: row.capabilities,
    }
  }
}
