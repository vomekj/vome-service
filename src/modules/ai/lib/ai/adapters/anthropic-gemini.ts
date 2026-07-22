import { openaiCompatibleAdapter } from './openai-compatible'
import type { AiProtocolAdapter } from '../types'
import { buildUpstreamHeaders } from './auth-headers'

/** 基于 openai 透传，仅替换鉴权头（Anthropic Messages API） */
export const anthropicAdapter: AiProtocolAdapter = {
  protocol: 'anthropic',

  invoke(capability, mode, input, ctx) {
    return openaiCompatibleAdapter.invoke(capability, mode, input, {
      ...ctx,
      extra: {
        ...(ctx.extra ?? {}),
        headers: buildUpstreamHeaders(ctx, 'anthropic'),
      },
    })
  },

  stream(capability, input, ctx) {
    if (!openaiCompatibleAdapter.stream) {
      throw new Error('stream not supported')
    }
    return openaiCompatibleAdapter.stream(capability, input, {
      ...ctx,
      extra: {
        ...(ctx.extra ?? {}),
        headers: buildUpstreamHeaders(ctx, 'anthropic'),
      },
    })
  },

  pollTask(capability, upstreamId, ctx) {
    if (!openaiCompatibleAdapter.pollTask) {
      throw new Error('pollTask not supported')
    }
    return openaiCompatibleAdapter.pollTask(capability, upstreamId, {
      ...ctx,
      extra: {
        ...(ctx.extra ?? {}),
        headers: buildUpstreamHeaders(ctx, 'anthropic'),
      },
    })
  },
}

/** Gemini generateContent：透传 + x-goog-api-key 或 ?key= */
export const geminiAdapter: AiProtocolAdapter = {
  protocol: 'gemini',

  async invoke(capability, mode, input, ctx) {
    if (mode === 'stream') {
      throw new Error('gemini 流式请走 gateway stream（实验性）')
    }
    const geminiCtx = {
      ...ctx,
      extra: {
        ...(ctx.extra ?? {}),
        headers: buildUpstreamHeaders(ctx, 'gemini'),
      },
    }
    return openaiCompatibleAdapter.invoke(capability, mode, input, geminiCtx)
  },

  async *stream(capability, input, ctx) {
    if (!openaiCompatibleAdapter.stream) throw new Error('stream not supported')
    yield* openaiCompatibleAdapter.stream(capability, input, {
      ...ctx,
      extra: {
        ...(ctx.extra ?? {}),
        headers: buildUpstreamHeaders(ctx, 'gemini'),
      },
    })
  },

  pollTask(capability, upstreamId, ctx) {
    return openaiCompatibleAdapter.pollTask!(capability, upstreamId, ctx)
  },
}
