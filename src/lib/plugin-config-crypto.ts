import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { VomeConfig } from '/#/server'

/** 前端回显 / 未改动时提交的脱敏占位符 */
export const PLUGIN_SECRET_MASK = '********'

const ENC_PREFIX = 'enc:v1:'

function deriveKey(): Buffer {
  return createHash('sha256')
    .update(String((VomeConfig as { keys?: string }).keys ?? 'vome'))
    .digest()
}

/** 键名是否视为密钥字段 */
export function isPluginSecretKey(key: string): boolean {
  if (key.toLowerCase() === 'token') return true
  return /(secret|password|privateKey|accessKeySecret|apiSecret)$/i.test(key)
}

function encryptPlain(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', deriveKey(), iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return ENC_PREFIX + Buffer.concat([iv, tag, enc]).toString('base64url')
}

function decryptValue(value: string): string {
  if (!value.startsWith(ENC_PREFIX)) return value
  const buf = Buffer.from(value.slice(ENC_PREFIX.length), 'base64url')
  if (buf.length < 28) return value
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const data = buf.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}

/** 单字段密钥加密（已密文 / 空串原样返回） */
export function encryptSecret(plain: string): string {
  if (!plain || plain.startsWith(ENC_PREFIX)) return plain
  return encryptPlain(plain)
}

/** 单字段密钥解密（非密文原样返回） */
export function decryptSecret(value: string): string {
  try {
    return decryptValue(value)
  } catch {
    return value
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

/** 递归脱敏：敏感字符串 → 占位符（供 info 回前端） */
export function maskPluginConfig(input: unknown): unknown {
  if (Array.isArray(input)) return input.map((item) => maskPluginConfig(item))
  if (!isPlainObject(input)) return input
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (isPluginSecretKey(key) && typeof value === 'string' && value.length > 0) {
      out[key] = PLUGIN_SECRET_MASK
    } else {
      out[key] = maskPluginConfig(value)
    }
  }
  return out
}

/** 递归解密：供插件中心注入（legacy 明文透传） */
export function decryptPluginConfig(input: unknown): unknown {
  if (Array.isArray(input)) return input.map((item) => decryptPluginConfig(item))
  if (!isPlainObject(input)) return input
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (isPluginSecretKey(key) && typeof value === 'string') {
      try {
        out[key] = decryptValue(value)
      } catch {
        out[key] = value
      }
    } else {
      out[key] = decryptPluginConfig(value)
    }
  }
  return out
}

/**
 * 合并写入：新值为脱敏占位符则保留旧值（明文或密文）
 */
export function mergePluginConfig(
  incoming: unknown,
  existing: unknown,
): unknown {
  if (Array.isArray(incoming)) {
    return incoming.map((item, i) =>
      mergePluginConfig(
        item,
        Array.isArray(existing) ? existing[i] : undefined,
      ),
    )
  }
  if (!isPlainObject(incoming)) return incoming
  const prev = isPlainObject(existing) ? existing : {}
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(incoming)) {
    if (
      isPluginSecretKey(key) &&
      typeof value === 'string' &&
      value === PLUGIN_SECRET_MASK
    ) {
      out[key] = prev[key] ?? ''
      continue
    }
    if (isPlainObject(value) || Array.isArray(value)) {
      out[key] = mergePluginConfig(value, prev[key])
      continue
    }
    out[key] = value
  }
  return out
}

/** 递归加密敏感叶子；已是 enc:v1 则跳过；空串不加密 */
export function encryptPluginConfig(input: unknown): unknown {
  if (Array.isArray(input)) return input.map((item) => encryptPluginConfig(item))
  if (!isPlainObject(input)) return input
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (isPluginSecretKey(key) && typeof value === 'string') {
      if (!value || value.startsWith(ENC_PREFIX) || value === PLUGIN_SECRET_MASK) {
        out[key] = value === PLUGIN_SECRET_MASK ? '' : value
      } else {
        out[key] = encryptPlain(value)
      }
    } else {
      out[key] = encryptPluginConfig(value)
    }
  }
  return out
}

/** 写入管线：合并占位符 → 加密敏感字段 */
export function preparePluginConfigForStore(
  incoming: unknown,
  existing: unknown,
): Record<string, unknown> {
  const merged = mergePluginConfig(incoming, existing)
  const encrypted = encryptPluginConfig(merged)
  return isPlainObject(encrypted) ? encrypted : {}
}
