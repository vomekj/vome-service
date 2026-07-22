import { t } from 'elysia'
import {
  BaseController,
  Body,
  Controller,
  Inject,
  Post,
} from '/#/server'
import { aiModel } from '../../entity/model'
import { AiGateway } from '../../service/gateway'
import { AiModelService } from '../../service/model'
import type { AiCapability, AiStreamChunk } from '../../lib/ai/types'

function sseResponse(stream: AsyncGenerator<AiStreamChunk>) {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`),
          )
          if (chunk.type === 'done' || chunk.type === 'error') break
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: 'error', error: { code: 'stream', message } })}\n\n`,
          ),
        )
      } finally {
        controller.close()
      }
    },
  })
  return new Response(body, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}

/** → service.ai.model（含 .call） */
@Controller({
  api: ['add', 'delete', 'update', 'info', 'list', 'page', 'restore'],
  entity: aiModel,
  service: AiModelService,
  pageQueryOp: {
    keyWordLikeFields: ['code', 'name', 'upstreamId', 'remark'],
    fieldEq: [
      { column: 'status', dict: 'status' },
      'providerId',
    ],
    addOrderBy: { id: 'desc' },
  },
  listQueryOp: {
    keyWordLikeFields: ['code', 'name'],
    fieldEq: [
      { column: 'status', dict: 'status' },
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
        capability: t.String(),
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
      capability: string
      input?: Record<string, unknown>
      taskId?: string
      options?: { timeoutMs?: number }
    },
  ) {
    const out = await this.aiGateway.call({
      model: body.model,
      capability: body.capability as AiCapability,
      input: body.input,
      taskId: body.taskId,
      options: body.options,
    })
    if (out.kind === 'stream') {
      return sseResponse(out.stream)
    }
    return this.ok(out)
  }
}
