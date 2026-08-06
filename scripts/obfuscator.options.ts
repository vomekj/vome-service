import type { ObfuscatorOptions } from 'javascript-obfuscator'

/**
 * 中等强度混淆（生产部署用）
 * - stringArray + 标识符混淆
 * - 关闭 controlFlow / selfDefending
 */
export const obfuscatorOptions: ObfuscatorOptions = {
  compact: true,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  debugProtection: false,
  disableConsoleOutput: false,
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,
  rotateStringArray: true,
  selfDefending: false,
  shuffleStringArray: true,
  splitStrings: false,
  stringArray: true,
  stringArrayCallsTransform: false,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.75,
  /** 插件 runtime 入口 + 跨混淆模块共享键（禁止进 stringArray） */
  reservedStrings: [
    'vome-plugin-runtime',
    'vome.hostConfig',
    'vome.hostBindings',
  ],
  transformObjectKeys: false,
  unicodeEscapeSequence: false,
  target: 'node',
}
