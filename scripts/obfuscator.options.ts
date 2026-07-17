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
  /** 插件 external 入口，混淆后宿主靠字面量/require 拦截注入 BasePlugin */
  reservedStrings: ['vome-plugin-runtime'],
  transformObjectKeys: false,
  unicodeEscapeSequence: false,
  target: 'node',
}
