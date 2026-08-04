import { t } from 'elysia'
import { BaseController, Body, Context, Controller, Inject, Post } from '/#/server'
import { ProjectAiChatService } from '../../service/ai-chat'

@Controller({ description: 'App 项目 AI 会话（用户侧）' })
export class AppProjectAiChatController extends BaseController {
  @Inject()
  aiChat: ProjectAiChatService

  private requireUserId() {
    const ctx = Context.get() as {
      userId?: string | number | null
      bizUserId?: number | null
    } | null
    if (!ctx?.userId) throw new Error('未登录')
    const biz = Number(ctx.bizUserId)
    if (Number.isFinite(biz) && biz > 0) return biz
    const n = Number(ctx.userId)
    if (Number.isFinite(n) && n > 0) return n
    // Better Auth UUID：用稳定 hash 落库（单租户本地工程足够）
    let h = 0
    for (const c of String(ctx.userId)) h = (h * 31 + c.charCodeAt(0)) >>> 0
    return (h % 2_000_000_000) + 1
  }

  @Post('/session/list', { summary: '会话列表' })
  async sessionList(
    @Body(t.Object({ projectId: t.Number() })) body: { projectId: number },
  ) {
    return this.ok(
      await this.aiChat.listSessions(body.projectId, this.requireUserId()),
    )
  }

  @Post('/session/info', { summary: '会话详情' })
  async sessionInfo(
    @Body(
      t.Object({
        id: t.Optional(t.Number()),
        projectId: t.Optional(t.Number()),
        clientKey: t.Optional(t.String()),
      }),
    )
    body: { id?: number; projectId?: number; clientKey?: string },
  ) {
    return this.ok(
      await this.aiChat.getSession({ ...body, userId: this.requireUserId() }),
    )
  }

  @Post('/session/upsert', { summary: '创建/更新会话' })
  async sessionUpsert(
    @Body(
      t.Object({
        projectId: t.Number(),
        clientKey: t.String(),
        title: t.Optional(t.String()),
        messages: t.Optional(
          t.Array(
            t.Object({
              clientKey: t.Optional(t.String()),
              role: t.String(),
              content: t.Optional(t.String()),
              text: t.Optional(t.String()),
              embedding: t.Optional(t.Array(t.Number())),
              embeddingModel: t.Optional(t.String()),
            }),
          ),
        ),
      }),
    )
    body: {
      projectId: number
      clientKey: string
      title?: string
      messages?: Array<{
        clientKey?: string
        role: string
        content?: string
        text?: string
        embedding?: number[]
        embeddingModel?: string
      }>
    },
  ) {
    return this.ok(
      await this.aiChat.upsertSession({
        ...body,
        userId: this.requireUserId(),
      }),
    )
  }

  @Post('/session/delete', { summary: '删除会话' })
  async sessionDelete(
    @Body(
      t.Object({
        id: t.Optional(t.Number()),
        projectId: t.Optional(t.Number()),
        clientKey: t.Optional(t.String()),
      }),
    )
    body: { id?: number; projectId?: number; clientKey?: string },
  ) {
    return this.ok(
      await this.aiChat.deleteSession({
        ...body,
        userId: this.requireUserId(),
      }),
    )
  }

  @Post('/history/retrieve', { summary: '历史向量检索' })
  async historyRetrieve(
    @Body(
      t.Object({
        projectId: t.Number(),
        vector: t.Optional(t.Array(t.Number())),
        topK: t.Optional(t.Number()),
        excludeClientKey: t.Optional(t.String()),
      }),
    )
    body: {
      projectId: number
      vector?: number[]
      topK?: number
      excludeClientKey?: string
    },
  ) {
    return this.ok(
      await this.aiChat.retrieveHistory({
        ...body,
        userId: this.requireUserId(),
      }),
    )
  }
}
