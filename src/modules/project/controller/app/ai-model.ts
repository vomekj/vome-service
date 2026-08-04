import { t } from 'elysia'
import {
  BaseController,
  Body,
  CommException,
  Context,
  Controller,
  Inject,
  Post,
  getEnv,
} from '/#/server'
import { ProjectAiModelService } from '../../service/ai-model'

/**
 * 自接模型：密钥落用户侧 DB（apiKeyEnc AES）。
 * 全量 API 仅 NODE_ENV=dev 开放，防止生产 App 用户凭 JWT 拉取密钥/打模型。
 */
@Controller({ description: 'App 自接 AI 模型（用户侧，仅开发模式）' })
export class AppProjectAiModelController extends BaseController {
  @Inject()
  aiModel: ProjectAiModelService

  private requireDev() {
    if (getEnv() !== 'dev') {
      throw new CommException('自接模型仅开发模式可用')
    }
  }

  private requireUser() {
    this.requireDev()
    const ctx = Context.get() as { userId?: string | number | null } | null
    if (!ctx?.userId) throw new Error('未登录')
  }

  @Post('/list', { summary: '自接模型列表（不含密钥）' })
  async list(
    @Body(t.Object({ projectId: t.Number() })) body: { projectId: number },
  ) {
    this.requireUser()
    return this.ok(await this.aiModel.list(body.projectId))
  }

  @Post('/create', { summary: '添加自接模型' })
  async create(
    @Body(
      t.Object({
        projectId: t.Number(),
        code: t.Optional(t.String()),
        name: t.Optional(t.String()),
        baseUrl: t.String(),
        apiKey: t.String(),
        capabilities: t.Optional(t.Array(t.String())),
        remark: t.Optional(t.String()),
      }),
    )
    body: {
      projectId: number
      code?: string
      name?: string
      baseUrl: string
      apiKey: string
      capabilities?: string[]
      remark?: string
    },
  ) {
    this.requireUser()
    return this.ok(await this.aiModel.create(body))
  }

  @Post('/update', { summary: '更新自接模型' })
  async update(
    @Body(
      t.Object({
        id: t.Number(),
        name: t.Optional(t.String()),
        baseUrl: t.Optional(t.String()),
        apiKey: t.Optional(t.String()),
        capabilities: t.Optional(t.Array(t.String())),
        remark: t.Optional(t.String()),
        status: t.Optional(t.Number()),
      }),
    )
    body: {
      id: number
      name?: string
      baseUrl?: string
      apiKey?: string
      capabilities?: string[]
      remark?: string
      status?: number
    },
  ) {
    this.requireUser()
    return this.ok(await this.aiModel.update(body))
  }

  @Post('/delete', { summary: '删除自接模型' })
  async remove(@Body(t.Object({ id: t.Number() })) body: { id: number }) {
    this.requireUser()
    return this.ok(await this.aiModel.remove(body.id))
  }

  @Post('/resolve', { summary: '解析自接模型（含密钥，仅本机 agent / 开发模式）' })
  async resolve(
    @Body(t.Object({ projectId: t.Number(), code: t.String() }))
    body: { projectId: number; code: string },
  ) {
    this.requireUser()
    return this.ok(
      await this.aiModel.resolveForCall(body.projectId, body.code),
    )
  }
}
