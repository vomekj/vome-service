import type { AiCapability } from './types'

/** 连通性探测用的最小请求体（不依赖本地测试文件） */
export function minimalTestInput(
  capability: AiCapability,
  code: string,
): Record<string, unknown> {
  switch (capability) {
    case 'chat':
      return { messages: [{ role: 'user', content: `ping ${code}` }] }
    case 'image':
      return { prompt: '生成星空点点', size: '1K', ratio: '1:1' }
    case 'embed':
      return { input: 'ping' }
    case 'audio_tts':
      return { input: 'ping' }
    case 'audio_stt':
      return { __probe: true }
    case 'video':
      return { prompt: '夜空中星星闪烁萤火相交呼应', num_frames: 81, frame_rate: 24 }
    default:
      return {}
  }
}
