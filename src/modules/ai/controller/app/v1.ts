import { t } from 'elysia'
import {
  BaseController,
  CommException,
  Controller,
  Get,
  Inject,
  Post,
  Public,
  Body,
} from '/#/server'
import { AiGateway } from '../../service/gateway'
import { AiModelService } from '../../service/model'
import { aiProxyAuthMiddleware } from '../../service/proxy-auth'
import type { AiCapability, AiStreamChunk } from '../../lib/ai/types'
import {
  openAiBodyToInput,
  toOpenAiChatCompletion,
  toOpenAiEmbedResponse,
  toOpenAiImageResponse,
  toOpenAiStreamChunk,
} from '../../lib/ai/proxy/openai'

function openAiSse(stream: AsyncGenerator<AiStreamChunk>, model: string) {
  const encoder = new TextEncoder()
  return new Response(
    new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const payload = toOpenAiStreamChunk(chunk, model)
            if (payload === '[DONE]') {
              controller.enqueue(encoder.encode('data: [DONE]\n\n'))
              break
            }
            controller.enqueue(encoder.encode(`data: ${payload}\n\n`))
            if (chunk.type === 'error') break
          }
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e)
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ error: { message } })}\n\n`,
            ),
          )
        } finally {
          controller.close()
        }
      },
    }),
    {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    },
  )
}

/**
 * OpenAI 兼容反向代理（OpenCode / Cursor 等）
 * Base URL: `{host}/app/v1`
 */
@Controller({ prefix: '/v1', middleware: aiProxyAuthMiddleware })
export class AiV1ProxyController extends BaseController {
  @Inject()
  aiGateway: AiGateway

  @Inject()
  aiModel: AiModelService

  @Get('/models', { summary: '可用模型目录（含参数提示）' })
  async models() {
    return this.ok(await this.aiModel.listCatalog())
  }

  @Public()
  @Post('/chat/completions', { summary: 'OpenAI Chat Completions 代理' })
  async chatCompletions(
    @Body(t.Record(t.String(), t.Any())) body: Record<string, unknown>,
  ) {
    const model = String(body.model ?? '')
    if (!model) return this.fail('model 不能为空')

    const capability: AiCapability = 'chat'
    const input = openAiBodyToInput(body, capability)
    const stream = body.stream === true

    const out = await this.aiGateway.call(
      {
        model,
        capability,
        input,
        options: {
          stream: stream,
          timeoutMs: stream ? undefined : 120_000,
        },
      },
      { source: 'proxy' },
    )

    if (out.kind === 'stream') {
      return openAiSse(out.stream, model)
    }
    if (!out.ok) throw new CommException(out.error?.message ?? 'upstream error')
    return toOpenAiChatCompletion(out)
  }

  @Public()
  @Post('/images/generations', { summary: 'OpenAI Images 代理' })
  async imagesGenerations(
    @Body(t.Record(t.String(), t.Any())) body: Record<string, unknown>,
  ) {
    const model = String(body.model ?? '')
    const out = await this.aiGateway.call(
      {
        model,
        capability: 'image',
        input: openAiBodyToInput(body, 'image'),
      },
      { source: 'proxy' },
    )
    if (out.kind !== 'json') throw new CommException('unexpected stream')
    if (!out.ok) throw new CommException(out.error?.message ?? 'upstream error')
    return toOpenAiImageResponse(out)
  }

  @Public()
  @Post('/embeddings', { summary: 'OpenAI Embeddings 代理' })
  async embeddings(
    @Body(t.Record(t.String(), t.Any())) body: Record<string, unknown>,
  ) {
    const model = String(body.model ?? '')
    const out = await this.aiGateway.call(
      {
        model,
        capability: 'embed',
        input: openAiBodyToInput(body, 'embed'),
      },
      { source: 'proxy' },
    )
    if (out.kind !== 'json') throw new CommException('unexpected stream')
    if (!out.ok) throw new CommException(out.error?.message ?? 'upstream error')
    return toOpenAiEmbedResponse(out)
  }

  @Public()
  @Post('/videos', { summary: 'OpenAI Videos 代理' })
  async videos(@Body(t.Record(t.String(), t.Any())) body: Record<string, unknown>) {
    const model = String(body.model ?? '')
    const out = await this.aiGateway.call(
      {
        model,
        capability: 'video',
        input: openAiBodyToInput(body, 'video'),
      },
      { source: 'proxy' },
    )
    if (out.kind !== 'json') throw new CommException('unexpected stream')
    if (!out.ok) throw new CommException(out.error?.message ?? 'upstream error')
    return out.raw ?? out.data
  }
}
