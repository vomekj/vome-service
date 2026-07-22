import { CommException } from '/#/server'
import type { AiInputSchema, AiInvokeInput } from './types'

function hasValue(v: unknown): boolean {
  if (v === undefined || v === null) return false
  if (typeof v === 'string') return v.trim().length > 0
  if (Array.isArray(v)) return v.length > 0
  return true
}

/** 按 inputSchema 中 required 字段校验 input（无 required 时跳过） */
export function validateInputSchema(
  input: AiInvokeInput | undefined,
  schema: AiInputSchema | null | undefined,
) {
  if (!schema?.fields?.length) return
  const body = input ?? {}
  const missing: string[] = []
  for (const f of schema.fields) {
    if (f.system) continue
    if (!f.required) continue
    const parts = f.key.split('.')
    let cur: unknown = body
    for (const p of parts) {
      if (cur == null || typeof cur !== 'object') {
        cur = undefined
        break
      }
      cur = (cur as Record<string, unknown>)[p]
    }
    if (!hasValue(cur)) missing.push(f.key)
  }
  if (missing.length) {
    throw new CommException(`input 缺少必填字段: ${missing.join(', ')}`)
  }
}
