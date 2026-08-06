import { t } from 'elysia'
import { BaseController, Body, Context, Controller, Inject, Post } from '@core/server'
import { ProjectSkillService } from '../../service/skill'

@Controller({ description: 'App 项目 Skills（用户侧）' })
export class AppProjectSkillController extends BaseController {
  @Inject()
  skill: ProjectSkillService

  private requireUser() {
    const ctx = Context.get() as { userId?: string | number | null } | null
    const userId = ctx?.userId != null ? String(ctx.userId) : ''
    if (!userId) throw new Error('未登录')
    return userId
  }

  @Post('/list', { summary: 'Skills 列表' })
  async list(@Body(t.Object({ projectId: t.Number() })) body: { projectId: number }) {
    this.requireUser()
    return this.ok(await this.skill.list(body.projectId))
  }

  @Post('/create', { summary: '新建 Skill' })
  async create(
    @Body(
      t.Object({
        projectId: t.Number(),
        name: t.Optional(t.String()),
        content: t.Optional(t.String()),
        embedding: t.Optional(t.Array(t.Number())),
        embeddingModel: t.Optional(t.String()),
      }),
    )
    body: {
      projectId: number
      name?: string
      content?: string
      embedding?: number[]
      embeddingModel?: string
    },
  ) {
    this.requireUser()
    return this.ok(await this.skill.create(body))
  }

  @Post('/update', { summary: '更新 Skill' })
  async update(
    @Body(
      t.Object({
        id: t.Number(),
        name: t.Optional(t.String()),
        content: t.Optional(t.String()),
        embedding: t.Optional(t.Array(t.Number())),
        embeddingModel: t.Optional(t.String()),
      }),
    )
    body: {
      id: number
      name?: string
      content?: string
      embedding?: number[]
      embeddingModel?: string
    },
  ) {
    this.requireUser()
    return this.ok(await this.skill.update(body))
  }

  @Post('/delete', { summary: '删除 Skill' })
  async remove(@Body(t.Object({ id: t.Number() })) body: { id: number }) {
    this.requireUser()
    return this.ok(await this.skill.remove(body.id))
  }

  @Post('/retrieve', { summary: '向量 Top-K Skills' })
  async retrieve(
    @Body(
      t.Object({
        projectId: t.Number(),
        vector: t.Optional(t.Array(t.Number())),
        topK: t.Optional(t.Number()),
      }),
    )
    body: { projectId: number; vector?: number[]; topK?: number },
  ) {
    this.requireUser()
    return this.ok(await this.skill.retrieve(body))
  }

  @Post('/seedIfEmpty', { summary: '空库播种' })
  async seedIfEmpty(
    @Body(
      t.Object({
        projectId: t.Number(),
        items: t.Optional(
          t.Array(
            t.Object({
              name: t.Optional(t.String()),
              content: t.Optional(t.String()),
              embedding: t.Optional(t.Array(t.Number())),
              embeddingModel: t.Optional(t.String()),
            }),
          ),
        ),
      }),
    )
    body: {
      projectId: number
      items?: Array<{
        name?: string
        content?: string
        embedding?: number[]
        embeddingModel?: string
      }>
    },
  ) {
    this.requireUser()
    return this.ok(await this.skill.seedIfEmpty(body))
  }
}
