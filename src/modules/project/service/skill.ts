import { and, eq, inArray, isNull } from 'drizzle-orm'
import {
  BaseService,
  CommException,
  DbStore,
  Inject,
  InjectRepository,
  Provide,
  type Repository,
} from '@core/server'
import { searchEmbeddingIds, syncEmbeddingVec } from '../../../lib/pgvector'
import { projectSkill } from '../entity/project-skill'

@Provide()
export class ProjectSkillService extends BaseService {
  @InjectRepository(projectSkill)
  skillRepo: Repository<typeof projectSkill>

  @Inject()
  db: DbStore

  private async syncVec(id: number, vector: number[]) {
    if (!vector?.length) return
    await syncEmbeddingVec(this.db.sql as never, {
      table: 'project_skill',
      id,
      vector,
      indexName: 'project_skill_embedding_vec_idx',
    })
  }

  async listByProject(projectId: number) {
    const pid = Number(projectId)
    if (!(pid > 0)) throw new CommException('项目 ID 无效')
    const rows = await this.skillRepo.find(
      and(
        eq(projectSkill.projectId, pid),
        eq(projectSkill.status, 1),
        isNull(projectSkill.deletedAt),
      ),
    )
    return rows
      .slice()
      .sort(
        (a, b) =>
          new Date(b.updateTime || 0).getTime() -
          new Date(a.updateTime || 0).getTime(),
      )
      .map(({ embedding: _e, ...rest }) => rest)
  }

  async create(body: {
    projectId: number
    name?: string
    content?: string
    userId?: number | null
    embedding?: number[]
    embeddingModel?: string
  }) {
    const projectId = Number(body.projectId)
    if (!(projectId > 0)) throw new CommException('项目 ID 无效')
    const name = String(body.name ?? '').trim() || '未命名 Skill'
    const content = String(body.content ?? '')
    const embedding = Array.isArray(body.embedding) ? body.embedding : []
    const row = await this.skillRepo.create({
      projectId,
      userId: body.userId != null ? Number(body.userId) : null,
      name,
      content,
      embedding,
      embeddingModel: body.embeddingModel || null,
      status: 1,
    })
    const saved = Array.isArray(row) ? row[0] : row
    await this.syncVec(Number(saved.id), embedding)
    return this.skillRepo.findOne(eq(projectSkill.id, Number(saved.id)))
  }

  async update(body: {
    id: number
    name?: string
    content?: string
    embedding?: number[]
    embeddingModel?: string
  }) {
    const id = Number(body.id)
    if (!(id > 0)) throw new CommException('Skill ID 无效')
    const row = await this.skillRepo.findOne(
      and(eq(projectSkill.id, id), isNull(projectSkill.deletedAt)),
    )
    if (!row) throw new CommException('Skill 不存在')
    const patch: Record<string, unknown> = {}
    if (body.name !== undefined) {
      const name = String(body.name ?? '').trim()
      if (!name) throw new CommException('名称不能为空')
      patch.name = name
    }
    if (body.content !== undefined) patch.content = String(body.content ?? '')
    if (body.embedding !== undefined) {
      patch.embedding = Array.isArray(body.embedding) ? body.embedding : []
      patch.embeddingModel = body.embeddingModel || null
    }
    if (!Object.keys(patch).length) throw new CommException('没有可更新的字段')
    await this.skillRepo.update(eq(projectSkill.id, id), patch)
    if (Array.isArray(body.embedding)) {
      await this.syncVec(id, body.embedding)
    }
    return this.skillRepo.findOne(eq(projectSkill.id, id))
  }

  async remove(idRaw: number) {
    const id = Number(idRaw)
    if (!(id > 0)) throw new CommException('Skill ID 无效')
    await this.skillRepo.softDelete(id)
    return { id }
  }

  async seedIfEmpty(body: {
    projectId: number
    items?: Array<{
      name?: string
      content?: string
      embedding?: number[]
      embeddingModel?: string
    }>
    userId?: number | null
  }) {
    const projectId = Number(body.projectId)
    if (!(projectId > 0)) throw new CommException('项目 ID 无效')
    const existing = await this.skillRepo.find(
      and(
        eq(projectSkill.projectId, projectId),
        eq(projectSkill.status, 1),
        isNull(projectSkill.deletedAt),
      ),
    )
    if (existing.length) return { seeded: 0, list: existing }
    let seeded = 0
    for (const it of body.items || []) {
      const content = String(it?.content || '').trim()
      if (!content) continue
      await this.create({
        projectId,
        name: String(it?.name || '').trim() || `skill-${seeded + 1}`,
        content: String(it?.content || ''),
        userId: body.userId,
        embedding: it?.embedding,
        embeddingModel: it?.embeddingModel,
      })
      seeded += 1
    }
    return { seeded, list: await this.listByProject(projectId) }
  }

  /** 向量检索；vector 由 agent 官网 embed 后传入 */
  async retrieve(body: {
    projectId: number
    vector?: number[]
    topK?: number
  }) {
    const projectId = Number(body.projectId)
    if (!(projectId > 0)) throw new CommException('项目 ID 无效')
    const topK = Math.max(1, Math.min(20, Number(body.topK) || 5))
    const vector = Array.isArray(body.vector) ? body.vector : []
    if (vector.length) {
      const ids = await searchEmbeddingIds(this.db.sql as never, {
        table: 'project_skill',
        vector,
        topK,
        whereSql: `"projectId" = ${projectId} AND status = 1 AND "deletedAt" IS NULL`,
        indexName: 'project_skill_embedding_vec_idx',
      })
      if (ids?.length) {
        const list = await this.skillRepo.find(inArray(projectSkill.id, ids))
        const sortMap = new Map(ids.map((id, i) => [id, i]))
        return list
          .sort((a, b) => (sortMap.get(a.id) ?? 0) - (sortMap.get(b.id) ?? 0))
          .map((r) => ({ id: r.id, name: r.name, content: r.content }))
      }
    }
    const fallback = await this.listByProject(projectId)
    return fallback.slice(0, topK).map((r) => ({
      id: r.id,
      name: r.name,
      content: r.content,
    }))
  }
}
