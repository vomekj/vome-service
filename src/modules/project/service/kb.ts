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
import { projectKbAdoption } from '../entity/project-kb-adoption'
import { projectKbChunk } from '../entity/project-kb-chunk'
import { projectKbDoc } from '../entity/project-kb-doc'

@Provide()
export class ProjectKbService extends BaseService {
  @InjectRepository(projectKbDoc)
  docRepo: Repository<typeof projectKbDoc>

  @InjectRepository(projectKbChunk)
  chunkRepo: Repository<typeof projectKbChunk>

  @InjectRepository(projectKbAdoption)
  adoptionRepo: Repository<typeof projectKbAdoption>

  @Inject()
  db: DbStore

  async upsertDoc(body: {
    projectId: number
    kind?: string
    title?: string
    summary?: string
    content?: string
    sourceType?: string
    sourceId?: string
    createdBy?: number | null
    embedding?: number[]
    embeddingModel?: string
    tags?: string[]
  }) {
    const projectId = Number(body.projectId)
    if (!(projectId > 0)) throw new CommException('项目 ID 无效')
    const kind = String(body.kind || 'context')
    const title = String(body.title || '知识条目').trim() || '知识条目'
    const content = String(body.content || '')
    const summary = String(body.summary || '')
    const embedding = Array.isArray(body.embedding) ? body.embedding : []
    const row = await this.docRepo.create({
      projectId,
      kind,
      title,
      sourceType: String(body.sourceType || 'manual'),
      sourceId: String(body.sourceId || ''),
      summary,
      content,
      tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
      enabled: 1,
      createdBy: body.createdBy != null ? Number(body.createdBy) : null,
    })
    const saved = Array.isArray(row) ? row[0] : row
    const chunk = await this.chunkRepo.create({
      docId: Number(saved.id),
      projectId,
      kind,
      chunkIndex: 0,
      summary,
      content: content || summary || title,
      embedding,
      embeddingModel: body.embeddingModel || null,
      meta: { title },
      enabled: 1,
    })
    const savedChunk = Array.isArray(chunk) ? chunk[0] : chunk
    if (embedding.length) {
      await syncEmbeddingVec(this.db.sql as never, {
        table: 'project_kb_chunk',
        id: Number(savedChunk.id),
        vector: embedding,
        indexName: 'project_kb_chunk_embedding_vec_idx',
      })
    }
    return saved
  }

  async adoptionWriteback(body: {
    projectId: number
    userId: number
    title?: string
    summary?: string
    content?: string
    sceneType?: string
    embedding?: number[]
    embeddingModel?: string
  }) {
    const projectId = Number(body.projectId)
    const userId = Number(body.userId)
    if (!(projectId > 0) || !(userId > 0)) throw new CommException('参数无效')
    const row = await this.adoptionRepo.create({
      projectId,
      userId,
      sceneType: String(body.sceneType || 'editor-chat'),
      title: String(body.title || ''),
      summary: String(body.summary || ''),
      content: String(body.content || ''),
    })
    const saved = Array.isArray(row) ? row[0] : row
    await this.upsertDoc({
      projectId,
      kind: 'adoption',
      title: saved.title || saved.summary || '采纳结果',
      summary: saved.summary || '',
      content: saved.content || '',
      sourceType: 'adoption',
      sourceId: String(saved.id),
      createdBy: userId,
      embedding: body.embedding,
      embeddingModel: body.embeddingModel,
    })
    return saved
  }

  async search(body: {
    projectId: number
    vector?: number[]
    topK?: number
    kinds?: string[]
  }) {
    const projectId = Number(body.projectId)
    if (!(projectId > 0)) throw new CommException('项目 ID 无效')
    const topK = Math.max(1, Math.min(20, Number(body.topK) || 5))
    const kinds = Array.isArray(body.kinds)
      ? body.kinds.map(String).filter(Boolean)
      : []
    const kindSql = kinds.length
      ? `AND kind IN (${kinds.map((k) => `'${k.replace(/'/g, "''")}'`).join(',')})`
      : ''
    const vector = Array.isArray(body.vector) ? body.vector : []
    if (vector.length) {
      const ids = await searchEmbeddingIds(this.db.sql as never, {
        table: 'project_kb_chunk',
        vector,
        topK,
        whereSql: `"projectId" = ${projectId} AND enabled = 1 AND "deletedTime" IS NULL ${kindSql}`,
        indexName: 'project_kb_chunk_embedding_vec_idx',
      })
      if (ids?.length) {
        const list = await this.chunkRepo.find(inArray(projectKbChunk.id, ids))
        const sortMap = new Map(ids.map((id, i) => [id, i]))
        return list.sort(
          (a, b) => (sortMap.get(a.id) ?? 0) - (sortMap.get(b.id) ?? 0),
        )
      }
    }
    const where = [
      eq(projectKbChunk.projectId, projectId),
      eq(projectKbChunk.enabled, 1),
      isNull(projectKbChunk.deletedTime),
      kinds.length ? inArray(projectKbChunk.kind, kinds) : undefined,
    ].filter(Boolean)
    const list = await this.chunkRepo.find(and(...where))
    return list.slice(0, topK)
  }
}
