import { openaiCompatibleAdapter } from './openai-compatible'
import type { AiProtocolAdapter } from '../types'

const adapters: Record<string, AiProtocolAdapter> = {
  [openaiCompatibleAdapter.protocol]: openaiCompatibleAdapter,
}

export function getAiAdapter(protocol: string): AiProtocolAdapter | undefined {
  return adapters[protocol]
}

export function listAiProtocols(): string[] {
  return Object.keys(adapters)
}
