import { openaiCompatibleAdapter } from './openai-compatible'
import { anthropicAdapter, geminiAdapter } from './anthropic-gemini'
import type { AiProtocolAdapter } from '../types'

const adapters: Record<string, AiProtocolAdapter> = {
  [openaiCompatibleAdapter.protocol]: openaiCompatibleAdapter,
  [anthropicAdapter.protocol]: anthropicAdapter,
  [geminiAdapter.protocol]: geminiAdapter,
}

export function getAiAdapter(protocol: string): AiProtocolAdapter | undefined {
  return adapters[protocol]
}

export function listAiProtocols(): string[] {
  return Object.keys(adapters)
}
