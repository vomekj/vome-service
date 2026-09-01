import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
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
import { projectAiMessage } from '../entity/project-ai-message'
import { projectAiSession } from '../entity/project-ai-session'

type MsgIn = {
  clientKey?: string
  role: string
  content?: string
  text?: string
  embedding?: number[]
  embeddingModel?: string
}

@Provide()
export class ProjectAiChatService extends BaseService {
  @InjectRepository(projectAiSession)
  sessionRepo: Repository<typeof projectAiSession>

  @InjectRepository(projectAiMessage)
  messageRepo: Repository<typeof projectAiMessage>

  @Inject()
  db: DbStore

  private async syncMsgVec(id: number, vector: number[]) {
    if (!vector?.length) return
    await syncEmbeddingVec(this.db.sql as never, {
      table: 'project_ai_message',
      id,
      vector,
      indexName: 'project_ai_message_embedding_vec_idx',
    })
  }

  async listSessions(projectId: number, userId: number) {
    const pid = Number(projectId)
    const uid = Number(userId)
    if (!(pid > 0) || !(uid > 0)) throw new CommException('参数无效')
    const rows = await this.sessionRepo.find(
      and(
        eq(projectAiSession.projectId, pid),
        eq(projectAiSession.userId, uid),
        eq(projectAiSession.status, 1),
        isNull(projectAiSession.deletedAt),
      ),
    )
    return rows
      .slice()
      .sort(
        (a, b) =>
          new Date(b.updateTime || 0).getTime() -
          new Date(a.updateTime || 0).getTime(),
      )
      .map((s) => ({
        id: s.id,
        clientKey: s.clientKey,
        title: s.title,
        updateTime: s.updateTime,
        createTime: s.createTime,
      }))
  }

  async getSession(body: {
    id?: number
    projectId?: number
    clientKey?: string
    userId: number
  }) {
    const session = await this.findSession(body)
    const msgs = await this.messageRepo.find(
      and(
        eq(projectAiMessage.sessionId, Number(session.id)),
        eq(projectAiMessage.status, 1),
        isNull(projectAiMessage.deletedAt),
      ),
      { orderBy: [asc(projectAiMessage.seq)] },
    )
    return {
      id: session.id,
      clientKey: session.clientKey,
      title: session.title,
      projectId: session.projectId,
      updateTime: session.updateTime,
      messages: msgs.map((m) => ({
        id: m.id,
        clientKey: m.clientKey,
        role: m.role,
        content: m.content,
        seq: m.seq,
        createTime: m.createTime,
      })),
    }
  }

  private async findSession(body: {
    id?: number
    projectId?: number
    clientKey?: string
    userId: number
  }) {
    const userId = Number(body.userId)
    let row: Awaited<
      ReturnType<Repository<typeof projectAiSession>['findOne']>
    > | undefined
    const id = Number(body.id)
    if (id > 0) {
      row = await this.sessionRepo.findOne(
        and(
          eq(projectAiSession.id, id),
          eq(projectAiSession.userId, userId),
          isNull(projectAiSession.deletedAt),
        ),
      )
    } else {
      const projectId = Number(body.projectId)
      const clientKey = String(body.clientKey || '').trim()
      if (!(projectId > 0) || !clientKey) {
        throw new CommException('会话定位参数无效')
      }
      row = await this.sessionRepo.findOne(
        and(
          eq(projectAiSession.projectId, projectId),
          eq(projectAiSession.clientKey, clientKey),
          eq(projectAiSession.userId, userId),
          isNull(projectAiSession.deletedAt),
        ),
      )
    }
    if (!row || Number(row.status) !== 1) throw new CommException('会话不存在')
    return row
  }

  async upsertSession(body: {
    projectId: number
    userId: number
    clientKey: string
    title?: string
    messages?: MsgIn[]
  }) {
    const projectId = Number(body.projectId)
    const userId = Number(body.userId)
    const clientKey = String(body.clientKey || '').trim()
    if (!(projectId > 0) || !(userId > 0) || !clientKey) {
      throw new CommException('参数无效')
    }
    let session = await this.sessionRepo.findOne(
      and(
        eq(projectAiSession.projectId, projectId),
        eq(projectAiSession.clientKey, clientKey),
        eq(projectAiSession.userId, userId),
      ),
      { withTrashed: true },
    )
    const title =
      String(body.title ?? '').trim() ||
      String(session?.title || '') ||
      '新对话'
    if (!session) {
      const created = await this.sessionRepo.create({
        projectId,
        userId,
        clientKey,
        title,
        status: 1,
      })
      session = Array.isArray(created) ? created[0] : created
    } else {
      if (session.deletedAt) await this.sessionRepo.restore(Number(session.id))
      await this.sessionRepo.update(eq(projectAiSession.id, Number(session.id)), {
        title,
        status: 1,
      })
      session = await this.sessionRepo.findOne(
        eq(projectAiSession.id, Number(session.id)),
      )
    }
    if (!session) throw new CommException('会话保存失败')
    const sessionId = Number(session.id)
    const incoming = Array.isArray(body.messages) ? body.messages : []
    const existing = await this.messageRepo.find(
      eq(projectAiMessage.sessionId, sessionId),
      { withTrashed: true },
    )
    const byClient = new Map(
      existing.map((m) => [String(m.clientKey), m] as const),
    )
    const keepKeys = new Set<string>()

    for (let i = 0; i < incoming.length; i++) {
      const m = incoming[i]!
      const role = String(m.role || '').trim()
      if (!role || role === 'system') continue
      const content = String(m.content ?? m.text ?? '')
      const msgKey =
        String(m.clientKey || '').trim() || `auto_${i}_${role}_${content.length}`
      keepKeys.add(msgKey)
      const embedding = Array.isArray(m.embedding) ? m.embedding : []
      const prev = byClient.get(msgKey)
      if (prev && !prev.deletedAt && String(prev.content) === content) {
        await this.messageRepo.update(eq(projectAiMessage.id, Number(prev.id)), {
          seq: i,
          role,
          status: 1,
        })
        continue
      }
      if (prev) {
        if (prev.deletedAt) await this.messageRepo.restore(Number(prev.id))
        await this.messageRepo.update(eq(projectAiMessage.id, Number(prev.id)), {
          role,
          content,
          seq: i,
          status: 1,
          embedding,
          embeddingModel: m.embeddingModel || null,
        })
        await this.syncMsgVec(Number(prev.id), embedding)
      } else {
        const created = await this.messageRepo.create({
          sessionId,
          projectId,
          userId,
          clientKey: msgKey,
          role,
          content,
          seq: i,
          embedding,
          embeddingModel: m.embeddingModel || null,
          status: 1,
        })
        const saved = Array.isArray(created) ? created[0] : created
        await this.syncMsgVec(Number(saved.id), embedding)
      }
    }
    for (const m of existing) {
      if (!keepKeys.has(String(m.clientKey)) && !m.deletedAt) {
        await this.messageRepo.softDelete(Number(m.id))
      }
    }
    return this.getSession({ id: sessionId, userId })
  }

  async deleteSession(body: {
    id?: number
    projectId?: number
    clientKey?: string
    userId: number
  }) {
    const session = await this.findSession(body)
    await this.sessionRepo.softDelete(Number(session.id))
    return { id: session.id }
  }

  async retrieveHistory(body: {
    projectId: number
    userId: number
    vector?: number[]
    topK?: number
    excludeClientKey?: string
  }) {
    const projectId = Number(body.projectId)
    const userId = Number(body.userId)
    if (!(projectId > 0) || !(userId > 0)) throw new CommException('参数无效')
    const topK = Math.max(1, Math.min(20, Number(body.topK) || 6))
    let excludeSql = ''
    const ck = String(body.excludeClientKey || '').trim()
    if (ck) {
      const s = await this.sessionRepo.findOne(
        and(
          eq(projectAiSession.projectId, projectId),
          eq(projectAiSession.clientKey, ck),
          eq(projectAiSession.userId, userId),
          isNull(projectAiSession.deletedAt),
        ),
      )
      if (s) excludeSql = `AND "sessionId" <> ${Number(s.id)}`
    }
    const vector = Array.isArray(body.vector) ? body.vector : []
    if (!vector.length) return []
    const ids = await searchEmbeddingIds(this.db.sql as never, {
      table: 'project_ai_message',
      vector,
      topK,
      whereSql: `"projectId" = ${projectId} AND "userId" = ${userId} AND status = 1 AND "deletedAt" IS NULL AND role IN ('user','assistant') ${excludeSql}`,
      indexName: 'project_ai_message_embedding_vec_idx',
    })
    if (!ids?.length) return []
    const list = await this.messageRepo.find(inArray(projectAiMessage.id, ids))
    const sortMap = new Map(ids.map((id, i) => [id, i]))
    return list
      .sort((a, b) => (sortMap.get(a.id) ?? 0) - (sortMap.get(b.id) ?? 0))
      .map((m) => ({
        id: m.id,
        sessionId: m.sessionId,
        role: m.role,
        content: String(m.content || '').slice(0, 2000),
      }))
  }
}
