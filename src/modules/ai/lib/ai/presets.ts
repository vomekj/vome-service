import type { AiAsyncSpec, AiInputSchema, AiResponseSpec } from './types'

/** 常用 inputSchema 模板（后台可粘贴） */
export const AI_INPUT_SCHEMA_PRESETS: Record<string, AiInputSchema> = {
  chat: {
    fields: [
      { key: 'messages', type: 'array', required: true, description: '对话消息' },
      { key: 'temperature', type: 'number', description: '随机性' },
      { key: 'top_p', type: 'number', description: '核采样' },
      { key: 'max_tokens', type: 'number', description: '最大输出 token' },
      { key: 'tools', type: 'array', description: '工具定义' },
      { key: 'tool_choice', type: 'object', description: '工具选择' },
      {
        key: 'chat_template_kwargs',
        type: 'object',
        description: 'Thinking 等扩展（OpenAI 兼容）',
      },
    ],
  },
  image: {
    fields: [
      { key: 'prompt', type: 'string', required: true, description: '生图指令' },
      {
        key: 'size',
        type: 'string',
        required: true,
        enum: ['1K', '2K', '3K', '4K'],
        description: '尺寸档位',
      },
      {
        key: 'ratio',
        type: 'string',
        enum: ['1:1', '16:9', '9:16', '4:3', '3:4'],
        description: '宽高比',
      },
      { key: 'return_base64', type: 'boolean', description: 'Base64 输出' },
      { key: 'extra_body', type: 'object', description: '高级参数' },
    ],
  },
  video: {
    fields: [
      { key: 'prompt', type: 'string', required: true, description: '视频描述' },
      { key: 'image', type: 'string', description: '图生视频 URL' },
      { key: 'width', type: 'number' },
      { key: 'height', type: 'number' },
      { key: 'num_frames', type: 'number', description: '帧数 ≤441，8n+1' },
      { key: 'frame_rate', type: 'number', description: '帧率 1-60' },
      { key: 'extra_body', type: 'object', description: '关键帧等' },
    ],
  },
  /** 语音合成 TTS */
  audio: {
    fields: [
      {
        key: 'input',
        type: 'string',
        required: true,
        description: '待合成文本',
      },
      {
        key: 'voice',
        type: 'string',
        description: '音色',
      },
      {
        key: 'model',
        type: 'string',
        description: '模型名称',
      },
      {
        key: 'response_format',
        type: 'string',
        enum: ['mp3', 'opus', 'aac', 'flac', 'pcm', 'wav'],
        description: '输出音频格式',
      },
      {
        key: 'speed',
        type: 'number',
        description: '语速',
      },
      {
        key: 'sample_rate',
        type: 'number',
        description: '采样率（如 8000/16000/24000/48000）',
      },
      {
        key: 'volume',
        type: 'number',
        description: '音量',
      },
      {
        key: 'pitch_rate',
        type: 'number',
        description: '音调',
      },
    ],
  },
  /** 语音识别 STT */
  audio_stt: {
    fields: [
      {
        key: 'file',
        type: 'string',
        description: '音频 base64 或 data-uri（网关转 multipart 上传）',
      },
      {
        key: 'audioUrl',
        type: 'string',
        description: '音频 URL（网关拉取后上传；不进入上游 JSON）',
        system: true,
      },
      {
        key: 'model',
        type: 'string',
        description: '模型名称',
      },
      {
        key: 'language',
        type: 'string',
        description: '语言',
      },
      {
        key: 'prompt',
        type: 'string',
        description: '热词或上下文提示',
      },
      {
        key: 'response_format',
        type: 'string',
        enum: ['json', 'text', 'srt', 'verbose_json'],
        description: '返回格式',
      },
      {
        key: 'timestamp_granularities',
        type: 'array',
        description: '时间戳粒度（如 word、segment）',
      },
    ],
  },
}

/** 常用 responseSpec 模板 */
export const AI_RESPONSE_SPEC_PRESETS: Record<string, AiResponseSpec> = {
  chat: {
    textPath: 'choices.0.message.content',
    messagesPath: 'choices.0.message',
    toolCallsPath: 'choices.0.message.tool_calls',
    inputTokensPath: 'usage.prompt_tokens',
    outputTokensPath: 'usage.completion_tokens',
    totalTokensPath: 'usage.total_tokens',
  },
  image: {
    assetsPath: 'data',
    assetUrlField: 'url',
    assetB64Field: 'b64_json',
    assetMime: 'image/png',
  },
  video: {
    assetUrlPath: 'metadata.url',
  },
  video_poll: {
    assetUrlPath: 'metadata.url',
  },
  audio: {
    binary: true,
    binaryMime: 'audio/mpeg',
    binaryFileName: 'speech.mp3',
  },
  audio_stt: {
    textPath: 'text',
  },
}

/** Agnes 厂商一键预设（path + schema + asyncSpec + responseSpec） */
export type AiVendorModelPreset = {
  code: string
  path: string
  capabilities: string[]
  resultModes: string[]
  contentType?: 'json' | 'multipart'
  inputSchema?: AiInputSchema
  responseSpec?: AiResponseSpec
  asyncSpec?: AiAsyncSpec
}

export const AI_VENDOR_PRESETS: Record<string, AiVendorModelPreset> = {
  'agnes-chat': {
    code: 'agnes-2.5-flash',
    path: '/v1/chat/completions',
    capabilities: ['chat'],
    resultModes: ['stream', 'sync'],
    inputSchema: AI_INPUT_SCHEMA_PRESETS.chat,
    responseSpec: AI_RESPONSE_SPEC_PRESETS.chat,
  },
  'agnes-image': {
    code: 'agnes-image-2.1-flash',
    path: '/v1/images/generations',
    capabilities: ['image'],
    resultModes: ['sync'],
    inputSchema: AI_INPUT_SCHEMA_PRESETS.image,
    responseSpec: AI_RESPONSE_SPEC_PRESETS.image,
  },
  'agnes-video': {
    code: 'agnes-video-v2.0',
    path: '/v1/videos',
    capabilities: ['video'],
    resultModes: ['async'],
    inputSchema: AI_INPUT_SCHEMA_PRESETS.video,
    asyncSpec: {
      pollPath: '/agnesapi?video_id={id}',
      idFields: ['video_id', 'task_id', 'id'],
      resultUrlPath: 'metadata.url',
      taskTimeoutMs: 3_600_000,
      assetMime: 'video/mp4',
    },
  },
}
