/**
 * 语言包 / dataI18n AI 翻译 system + user prompt。
 * 模型自行判断每条是「语句」还是「词组」，无需人工打标。
 * UI 语言包：JSON；dataI18n：编号纯文本行（N:text），禁止 JSON。
 */

const CLASSIFY_AND_STYLE = `For EACH string value, silently classify it as either PHRASE or SENTENCE, then translate accordingly (do not output the classification):

PHRASE — short UI/product labels: nav items, menu names, feature chips, card titles, slogan fragments, item/game names. Typical cues: very short (often a few words/characters), little or no sentence punctuation, or several short slogans separated only by spaces.
→ Prefer concise, natural product wording. In English usually 1–3 words. Prefer common gaming/product terms over literal word-by-word glosses. Do not pad with filler like "Opening", "Management", "Function" unless needed for clarity. Keep established Latin product tokens (e.g. ROLL) when they are part of the brand/UI.

SENTENCE — full sentences, disclaimers, legal/age copy, help text, instructions, longer descriptions that need complete meaning. Typical cues: sentence punctuation, longer prose, or clause structure.
→ Prefer clear, idiomatic, meaning-first translation. Do not mechanically stitch words; the result must read as natural copy in the target language.`

const JSON_OUTPUT_RULES = `Hard rules:
- Translate JSON string values only; keep all keys unchanged.
- Keep placeholders like {name}, {{count}}, %s intact.
- Keep placeholders shaped like __PH_0__ __PH_1__ __PH_2__ EXACTLY unchanged (do not translate, delete, merge, or renumber them).
- Do not translate pure Latin letters / numbers / symbols when they stand alone as codes or brands, unless the whole string is meant as readable prose.
- Output a single JSON object only, no markdown, no commentary.
- You MUST return every input key exactly once. Never stop early. Never repeat the whole answer.`

/** dataI18n 共用：分类风格 + 占位（输出格式由调用方追加） */
const DATA_PLACEHOLDER_RULES = `Hard rules:
- Keep placeholders shaped like __PH_0__ __PH_1__ __PH_2__ EXACTLY unchanged (do not translate, delete, merge, or renumber them).
- Keep placeholders like {name}, {{count}}, %s intact.
- Do not translate pure Latin letters / numbers / symbols when they stand alone as codes or brands, unless the whole string is meant as readable prose.`

/** dataI18n 短字段编号行输出 */
export const I18N_DATA_LINE_OUTPUT_RULES = `Output format (numbered plain lines):
- Input and output use numbered lines: N:text (1-based integer N).
- Translate ONLY the text after each "N:"; keep the same numbers, same order, same line count.
- Output plain numbered lines ONLY — no JSON, no markdown fences, no commentary, no blank preamble.
- You MUST return every input line number exactly once. Never stop early. Never repeat the whole answer.`

/** UI 语言包（i18n_pack） */
export const I18N_UI_TRANSLATE_SYSTEM = [
  'You are a professional UI i18n translator for product interfaces (admin/web/app).',
  CLASSIFY_AND_STYLE,
  JSON_OUTPUT_RULES,
].join('\n\n')

/** 业务 dataI18n（占位后纯文本；短字段另加 LINE 规则，长文另加整篇规则） */
export const I18N_DATA_TRANSLATE_SYSTEM = [
  'You are a professional translator for game/product catalog and CMS field values (including long HTML protocols).',
  CLASSIFY_AND_STYLE,
  DATA_PLACEHOLDER_RULES,
].join('\n\n')

export function i18nUiTranslateUserContent(opts: {
  sourceLangCode: string
  sourceLangName?: string
  langName: string
  langCode: string
  hint: string
  payloadJson: string
}): string {
  const from = opts.sourceLangName
    ? `${opts.sourceLangName} (${opts.sourceLangCode})`
    : opts.sourceLangCode
  return [
    `Translate the following UI locale JSON from ${from} into ${opts.langName} (${opts.langCode}).`,
    'Classify each value as PHRASE or SENTENCE yourself and apply the matching style.',
    opts.hint,
    '',
    opts.payloadJson,
  ].join('\n')
}

export function i18nDataTranslateUserContent(opts: {
  sourceLangCode: string
  sourceLangName?: string
  langName: string
  langCode: string
  hint: string
  /** 编号行：1:masked\\n2:masked */
  payloadText: string
}): string {
  const from = opts.sourceLangName
    ? `${opts.sourceLangName} (${opts.sourceLangCode})`
    : opts.sourceLangCode
  return [
    `Translate the following numbered lines from ${from} into ${opts.langName} (${opts.langCode}).`,
    'Format: N:text — keep each N, translate only the text after the colon.',
    'Non-translatable parts were replaced by placeholders __PH_0__ __PH_1__ … — keep every placeholder EXACTLY as-is; only translate the surrounding source-language text.',
    'Classify each value as PHRASE or SENTENCE yourself and apply the matching style.',
    opts.hint,
    '',
    opts.payloadText,
  ].join('\n')
}
