import { t } from 'elysia'
import {
  BaseController,
  Body,
  Controller,
  Get,
  Inject,
  Post,
  sseResponse,
} from '/#/server'
import { aiModel } from '../../entity/model'
import { AiGateway } from '../../service/gateway'
import { AiModelService } from '../../service/model'
import type { AiCapability } from '../../lib/ai/types'
import { minimalTestInput } from '../../lib/ai/minimal-test-input'
import { resolveAiCapability } from '../../lib/ai/types'

/** → service.ai.model（含 .call） */
@Controller({
  api: ['add', 'delete', 'update', 'info', 'list', 'page', 'restore'],
  entity: aiModel,
  service: AiModelService,
  pageQueryOp: {
    keyWordLikeFields: ['code', 'path', 'remark'],
    fieldEq: [
      { column: 'status', dict: 'status' },
      { column: 'method', dict: 'base_http_method' },
      { column: 'contentType', dict: 'base_ai_content_type' },
      'providerId',
    ],
    addOrderBy: { id: 'desc' },
  },
  listQueryOp: {
    keyWordLikeFields: ['code', 'path'],
    fieldEq: [
      { column: 'status', dict: 'status' },
      { column: 'method', dict: 'base_http_method' },
      { column: 'contentType', dict: 'base_ai_content_type' },
      'providerId',
    ],
    addOrderBy: { id: 'desc' },
  },
})
export class AiModelController extends BaseController {
  @Inject()
  aiModel: AiModelService

  @Inject()
  aiGateway: AiGateway

  @Post('/call', { summary: '统一调用模型' })
  async call(
    @Body(
      t.Object({
        model: t.String(),
        capability: t.Optional(t.String()),
        input: t.Optional(t.Record(t.String(), t.Any())),
        taskId: t.Optional(t.String()),
        options: t.Optional(
          t.Object({
            timeoutMs: t.Optional(t.Number()),
          }),
        ),
      }),
    )
    body: {
      model: string
      capability?: string
      input?: Record<string, unknown>
      taskId?: string
      options?: { timeoutMs?: number }
    },
  ) {
    const out = await this.aiGateway.call({
      model: body.model,
      capability: body.capability as AiCapability | undefined,
      input: body.input,
      taskId: body.taskId,
      options: body.options,
    })
    if (out.kind === 'stream') {
      return sseResponse(out.stream)
    }
    return this.ok(out)
  }

  @Post('/test', { summary: '连通性探测' })
  async test(
    @Body(
      t.Object({
        code: t.String(),
        capability: t.Optional(t.String()),
      }),
    )
    body: { code: string; capability?: string },
  ) {
    const model = await this.aiModel.findEnabledByCode(body.code)
    if (!model) return this.fail(`模型不存在或未启用: ${body.code}`)
    let capability: AiCapability
    try {
      capability = resolveAiCapability(body.capability, model.capabilities)
    } catch (e) {
      return this.fail(e instanceof Error ? e.message : String(e))
    }
    const input = minimalTestInput(capability, model.code)
    const started = Date.now()
    try {
      const out = await this.aiGateway.call(
        {
          model: body.code,
          capability,
          input,
          options: {
            stream: false,
            timeoutMs: 30_000,
          },
        },
        { source: 'test' },
      )
      const latencyMs = Date.now() - started
      if (out.kind === 'stream') return this.fail('unexpected stream')
      return this.ok({
        latencyMs,
        reachable: true,
        ok: out.ok,
        message: out.ok
          ? '上游已返回成功结果'
          : out.error?.message || '上游已返回错误响应',
        result: out,
        raw: out.raw,
      })
    } catch (e) {
      return this.ok({
        latencyMs: Date.now() - started,
        reachable: false,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        message: e instanceof Error ? e.message : String(e),
      })
    }
  }
}
