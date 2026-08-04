/**
 * 本地密钥加解密（自接模型 apiKey）；密钥派生自 config.keys
 */
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto'
import { VomeConfig } from '/#/server'

function aesKey() {
  const secret = String(
    (VomeConfig as { keys?: string }).keys || 'vome-service-jwt-secret',
  )
  return createHash('sha256').update(secret).digest()
}

export function encryptSecret(plain: string): string {
  const text = String(plain || '')
  if (!text) return ''
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', aesKey(), iv)
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${enc.toString('base64url')}`
}

export function decryptSecret(packed: string): string {
  const raw = String(packed || '')
  if (!raw) return ''
  if (!raw.startsWith('v1.')) return raw
  const parts = raw.split('.')
  if (parts.length !== 4) return ''
  const iv = Buffer.from(parts[1]!, 'base64url')
  const tag = Buffer.from(parts[2]!, 'base64url')
  const data = Buffer.from(parts[3]!, 'base64url')
  const decipher = createDecipheriv('aes-256-gcm', aesKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    'utf8',
  )
}
