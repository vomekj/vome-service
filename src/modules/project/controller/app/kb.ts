import { t } from 'elysia'
import { BaseController, Body, Context, Controller, Inject, Post } from '@core/server'
import { ProjectKbService } from '../../service/kb'

@Controller({ description: 'App 项目知识库（用户侧）' })
export class AppProjectKbController extends BaseController {
  @Inject()
  kb: ProjectKbService

  private requireUser() {
    const ctx = Context.get() as {
      userId?: string | number | null
      bizUserId?: number | null
    } | null
    if (!ctx?.userId) throw new Error('未登录')
    const biz = Number(ctx.bizUserId)
    if (Number.isFinite(biz) && biz > 0) return biz
    const n = Number(ctx.userId)
    if (Number.isFinite(n) && n > 0) return n
    let h = 0
    for (const c of String(ctx.userId)) h = (h * 31 + c.charCodeAt(0)) >>> 0
    return (h % 2_000_000_000) + 1
  }

  @Post('/upsert', { summary: '写入知识文档' })
  async upsert(
    @Body(
      t.Object({
        projectId: t.Number(),
        kind: t.Optional(t.String()),
        title: t.Optional(t.String()),
        summary: t.Optional(t.String()),
        content: t.Optional(t.String()),
        embedding: t.Optional(t.Array(t.Number())),
        embeddingModel: t.Optional(t.String()),
        tags: t.Optional(t.Array(t.String())),
      }),
    )
    body: {
      projectId: number
      kind?: string
      title?: string
      summary?: string
      content?: string
      embedding?: number[]
      embeddingModel?: string
      tags?: string[]
    },
  ) {
    const userId = this.requireUser()
    return this.ok(
      await this.kb.upsertDoc({ ...body, createdBy: userId }),
    )
  }

  @Post('/search', { summary: '向量检索知识块' })
  async search(
    @Body(
      t.Object({
        projectId: t.Number(),
        vector: t.Optional(t.Array(t.Number())),
        topK: t.Optional(t.Number()),
        kinds: t.Optional(t.Array(t.String())),
      }),
    )
    body: {
      projectId: number
      vector?: number[]
      topK?: number
      kinds?: string[]
    },
  ) {
    this.requireUser()
    return this.ok(await this.kb.search(body))
  }

  @Post('/adoptionWriteback', { summary: '采纳写回' })
  async adoptionWriteback(
    @Body(
      t.Object({
        projectId: t.Number(),
        title: t.Optional(t.String()),
        summary: t.Optional(t.String()),
        content: t.Optional(t.String()),
        sceneType: t.Optional(t.String()),
        embedding: t.Optional(t.Array(t.Number())),
        embeddingModel: t.Optional(t.String()),
      }),
    )
    body: {
      projectId: number
      title?: string
      summary?: string
      content?: string
      sceneType?: string
      embedding?: number[]
      embeddingModel?: string
    },
  ) {
    return this.ok(
      await this.kb.adoptionWriteback({
        ...body,
        userId: this.requireUser(),
      }),
    )
  }
}
