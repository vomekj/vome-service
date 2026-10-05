/**
 * dataI18n：非中文占位 → 纯文本送译 → 还原。
 * 短字段：编号行 N:text 分批；长文：整篇一次。语言包仍用 JSON 分批。
 */

/** 单次 AI 请求 JSON 体量上限（字符）；只按体积切，不限条数 */
export const DATA_I18N_AI_PAYLOAD_MAX_CHARS = 4_000

/**
 * 超此长度的 masked 字段走纯文本整篇翻译（不包 JSON）。
 * 用户协议约 1 万字：JSON 一次会被截断解析失败；纯文本可一次跑完。
 */
export const DATA_I18N_PLAIN_FIELD_CHARS = 2_000

/**
 * 占位格式：__PH_12__（ASCII，模型不易改写成 ⟨⟩/[]）
 */
export function placeholderToken(id: number): string {
  return `__PH_${id}__`
}

const PH_RE = /__PH_(\d+)__/g

/** 模型偶发改写的占位变体 → 标准 __PH_n__ */
const PH_VARIANT_RE =
  /(?:⟦|⟨|«|\[\[|\[)\s*(?:PH[_-]?|#)?\s*(\d+)\s*(?:⟧|⟩|»|\]\]|\])|\{+\s*(?:PH[_-]?|#)?\s*(\d+)\s*\}+/gi

/** 源语言汉字 + 常用中文/全角标点（与 system.langReplace 同范围） */
const CJK_CHAR_RE =
  /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3001-\u303f\uff01-\uff0f\uff1a-\uff1f]/

const HTML_TAG_RE = /^<[^>]*>/
const URL_RE =
  /^(?:https?|ftp|mailto|data):\/\/[^\s<>"']+|^\/\/[^\s<>"']+/i

export type MaskedNonChinese = {
  /** 非中文已换成 __PH_n__ 的文本 */
  masked: string
  /** 占位对应原文片段 */
  slots: string[]
  /** masked 里是否仍含需翻译的汉字 */
  hasSource: boolean
}

/**
 * 把非中文（HTML / URL / 拉丁数字符号等）提出换成占位符，中文整段保留。
 * 译完用 restoreMaskedPlaceholders 按位还原。
 */
export function maskNonChineseWithPlaceholders(text: string): MaskedNonChinese {
  const raw = String(text || '')
  if (!raw) return { masked: '', slots: [], hasSource: false }

  const slots: string[] = []
  const ph = (s: string) => {
    const i = slots.length
    slots.push(s)
    return placeholderToken(i)
  }

  let i = 0
  let out = ''
  while (i < raw.length) {
    const rest = raw.slice(i)
    const tag = rest.match(HTML_TAG_RE)
    if (tag) {
      out += ph(tag[0]!)
      i += tag[0]!.length
      continue
    }
    const url = rest.match(URL_RE)
    if (url) {
      out += ph(url[0]!)
      i += url[0]!.length
      continue
    }
    if (CJK_CHAR_RE.test(raw[i]!)) {
      let j = i + 1
      while (j < raw.length && CJK_CHAR_RE.test(raw[j]!)) j++
      out += raw.slice(i, j)
      i = j
      continue
    }
    let j = i + 1
    while (j < raw.length) {
      if (raw[j] === '<') break
      if (CJK_CHAR_RE.test(raw[j]!)) break
      const r2 = raw.slice(j)
      if (URL_RE.test(r2)) break
      j++
    }
    out += ph(raw.slice(i, j))
    i = j
  }

  const hasSource = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(out)
  return { masked: out, slots, hasSource }
}

/** 列出源 masked 中按出现顺序的占位 id */
export function listPlaceholderIds(masked: string): number[] {
  const ids: number[] = []
  const re = new RegExp(PH_RE.source, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(String(masked || '')))) {
    ids.push(Number(m[1]))
  }
  return ids
}

/** 把各类走样占位统一成 __PH_n__ */
export function normalizePlaceholderVariants(text: string): string {
  let s = String(text || '')
  // 旧版 ⟦n⟧ / 全角变体
  s = s.replace(/⟦\s*(\d+)\s*⟧/g, (_, n) => placeholderToken(Number(n)))
  s = s.replace(/⟨\s*(\d+)\s*⟩/g, (_, n) => placeholderToken(Number(n)))
  s = s.replace(PH_VARIANT_RE, (_all, a: string, b: string) =>
    placeholderToken(Number(a || b)),
  )
  return s
}

/**
 * 补回译文里缺失的占位：按源顺序，插到左侧最近已存在占位之后
 * （若无左侧锚点则插到右侧最近占位之前；再没有则追加末尾）。
 */
export function repairMissingPlaceholders(
  sourceMasked: string,
  translated: string,
): { text: string; missing: number[]; repaired: number[] } {
  const expected = listPlaceholderIds(sourceMasked)
  let out = normalizePlaceholderVariants(stripAiMarkdownFence(translated))
  const missing: number[] = []
  const repaired: number[] = []

  for (const id of expected) {
    const token = placeholderToken(id)
    if (out.includes(token)) continue
    missing.push(id)

    let insertAt = -1
    for (let j = id - 1; j >= 0; j--) {
      const left = placeholderToken(j)
      const idx = out.indexOf(left)
      if (idx >= 0) {
        insertAt = idx + left.length
        break
      }
    }
    if (insertAt < 0) {
      for (let j = id + 1; j < expected.length + 8; j++) {
        const right = placeholderToken(j)
        const idx = out.indexOf(right)
        if (idx >= 0) {
          insertAt = idx
          break
        }
      }
    }
    if (insertAt < 0) insertAt = out.length
    out = out.slice(0, insertAt) + token + out.slice(insertAt)
    repaired.push(id)
  }

  return { text: out, missing, repaired }
}

/**
 * AI 回包收尾：去围栏 → 规整变体 → 补缺失占位 → 校验齐全
 * 仍缺则抛错（调用方可重试）。
 */
export function finalizeMaskedTranslation(
  sourceMasked: string,
  aiText: string,
): string {
  const { text, missing, repaired } = repairMissingPlaceholders(
    sourceMasked,
    aiText,
  )
  const still = listPlaceholderIds(sourceMasked).filter(
    (id) => !text.includes(placeholderToken(id)),
  )
  if (still.length) {
    throw new Error(
      `占位符仍缺失: ${still.slice(0, 20).join(', ')}${still.length > 20 ? '…' : ''} (曾缺 ${missing.length}, 已补 ${repaired.length})`,
    )
  }
  if (repaired.length) {
    console.warn(
      `[data-i18n] repaired ${repaired.length} missing placeholder(s):`,
      repaired.slice(0, 12).join(', ') + (repaired.length > 12 ? '…' : ''),
    )
  }
  return text
}

/** 译文里的 __PH_n__ 换回原非中文片段 */
export function restoreMaskedPlaceholders(
  translated: string,
  slots: string[],
): string {
  const normalized = normalizePlaceholderVariants(String(translated || ''))
  return normalized.replace(PH_RE, (_, n: string) => {
    const i = Number(n)
    if (!Number.isInteger(i) || i < 0 || i >= slots.length) return ''
    return slots[i] ?? ''
  })
}

/** 去掉偶发 markdown 围栏 */
export function stripAiMarkdownFence(text: string): string {
  let s = String(text || '').trim()
  s = s.replace(/^```(?:\w+)?\s*/i, '').replace(/\s*```$/i, '')
  return s.trim()
}

/**
 * 扁平 key→value 按 JSON 体积分批（语言包仍用 JSON）。
 * 只按体积切，不限条数；单条超限时单独成批。
 */
export function batchFlatRecordByPayload(
  flat: Record<string, string>,
  maxPayloadChars = DATA_I18N_AI_PAYLOAD_MAX_CHARS,
): Record<string, string>[] {
  const limit = Math.max(
    400,
    Math.floor(Number(maxPayloadChars) || DATA_I18N_AI_PAYLOAD_MAX_CHARS),
  )
  const entries = Object.entries(flat).filter(
    ([, v]) => typeof v === 'string' && v.trim(),
  )
  if (!entries.length) return []

  const batches: Record<string, string>[] = []
  let cur: Record<string, string> = {}
  let size = 2
  let n = 0
  for (const [k, v] of entries) {
    const add = JSON.stringify(k).length + JSON.stringify(v).length + 8
    if (n > 0 && size + add > limit) {
      batches.push(cur)
      cur = {}
      size = 2
      n = 0
    }
    cur[k] = v
    size += add
    n += 1
  }
  if (n > 0) batches.push(cur)
  return batches
}

export type NumberedPlainItem = { key: string; masked: string }

/**
 * dataI18n 短字段：按编号纯文本行体积分批（不含 JSON）。
 * 单条超限单独成批。
 */
export function batchNumberedPlainItems(
  items: NumberedPlainItem[],
  maxPayloadChars = DATA_I18N_AI_PAYLOAD_MAX_CHARS,
): NumberedPlainItem[][] {
  const limit = Math.max(
    400,
    Math.floor(Number(maxPayloadChars) || DATA_I18N_AI_PAYLOAD_MAX_CHARS),
  )
  const list = items.filter((it) => String(it.masked || '').trim())
  if (!list.length) return []

  const batches: NumberedPlainItem[][] = []
  let cur: NumberedPlainItem[] = []
  let size = 0
  for (const it of list) {
    const add =
      String(cur.length + 1).length + 1 + it.masked.length + (cur.length ? 1 : 0)
    if (cur.length > 0 && size + add > limit) {
      batches.push(cur)
      cur = []
      size = 0
    }
    const addInBatch =
      String(cur.length + 1).length + 1 + it.masked.length + (cur.length ? 1 : 0)
    cur.push(it)
    size += addInBatch
  }
  if (cur.length) batches.push(cur)
  return batches
}

/** 组编号行：1:text\\n2:text */
export function formatNumberedPlainBatch(items: NumberedPlainItem[]): string {
  return items.map((it, i) => `${i + 1}:${it.masked}`).join('\n')
}

/** 编号行头：1: / 1： / 1. / 1) / 1、 */
const NUMBERED_LINE_RE = /^(\d+)\s*[:：.．、)\]]\s?(.*)$/

/**
 * 宽松解析编号行（不因缺号抛错）。支持续行、全角冒号/点号等变体。
 * 返回 1-based id → 译文（可含空串）。
 */
export function parseNumberedPlainBatchLoose(
  aiText: string,
): Map<number, string> {
  const raw = stripAiMarkdownFence(String(aiText || ''))
  const map = new Map<number, string>()
  let curId = 0
  for (const line of raw.split(/\r?\n/)) {
    const trimmedStart = line.replace(/^\s+/, '').replace(/^\*{1,2}|\*{1,2}$/g, '')
    const m = trimmedStart.match(NUMBERED_LINE_RE)
    if (m) {
      curId = Number(m[1])
      if (!Number.isInteger(curId) || curId <= 0) continue
      map.set(curId, String(m[2] ?? ''))
      continue
    }
    if (curId > 0 && map.has(curId)) {
      map.set(curId, `${map.get(curId)}\n${line}`)
    }
  }
  return map
}

/** 列出 1..expectedCount 中缺失或空内容的编号 */
export function listMissingNumberedIds(
  map: Map<number, string>,
  expectedCount: number,
): number[] {
  const missing: number[] = []
  for (let i = 1; i <= expectedCount; i++) {
    if (!map.has(i) || !String(map.get(i) ?? '').trim()) missing.push(i)
  }
  return missing
}

/**
 * 严格解析：缺号则抛错（兼容旧调用）。
 */
export function parseNumberedPlainBatch(
  aiText: string,
  expectedCount: number,
): Map<number, string> {
  const map = parseNumberedPlainBatchLoose(aiText)
  const missing = listMissingNumberedIds(map, expectedCount)
  if (missing.length) {
    throw new Error(
      `编号行缺失或为空: ${missing[0]}/${expectedCount}${
        missing.length > 1 ? ` (+${missing.length - 1})` : ''
      }`,
    )
  }
  return map
}
