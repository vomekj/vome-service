/**
 * 按访问者国家码映射首选语种（ISO 3166-1 alpha-2）
 * 语言包是否存在由调用方再校验；无包时回落 en-US。
 */

export const LOCALE_FALLBACK = 'en-US'

/** 英语国家 / 地区 */
const EN_COUNTRIES = new Set([
  'US',
  'GB',
  'UK',
  'AU',
  'NZ',
  'IE',
  'CA',
  'ZA',
  'JM',
  'TT',
  'BZ',
  'GY',
  'BS',
  'BB',
  'AG',
  'LC',
  'VC',
  'GD',
  'KN',
  'DM',
  'MT',
])

export function preferredLangByCountry(countryRaw: string): string {
  const c = String(countryRaw || '')
    .trim()
    .toUpperCase()
  if (!c || c === 'XX' || c === 'T1') return LOCALE_FALLBACK
  if (c === 'CN') return 'zh-CN'
  if (c === 'TW' || c === 'HK' || c === 'MO') return 'zh-HK'
  if (c === 'FR') return 'fr-FR'
  if (c === 'RU') return 'ru-RU'
  if (
    c === 'ES' ||
    c === 'MX' ||
    c === 'AR' ||
    c === 'CO' ||
    c === 'CL' ||
    c === 'PE' ||
    c === 'VE' ||
    c === 'EC' ||
    c === 'GT' ||
    c === 'CU' ||
    c === 'BO' ||
    c === 'DO' ||
    c === 'HN' ||
    c === 'PY' ||
    c === 'SV' ||
    c === 'NI' ||
    c === 'CR' ||
    c === 'PA' ||
    c === 'UY'
  ) {
    return 'es-ES'
  }
  if (c === 'PT' || c === 'BR' || c === 'AO' || c === 'MZ' || c === 'CV' || c === 'GW' || c === 'ST' || c === 'TL') {
    return 'pt-PT'
  }
  if (EN_COUNTRIES.has(c)) return 'en-US'
  return LOCALE_FALLBACK
}

/** 从 CDN / 反代头取国家码 */
export function countryFromHeaders(headers: Headers): string {
  const keys = [
    'cf-ipcountry',
    'x-vercel-ip-country',
    'cloudfront-viewer-country',
    'x-country-code',
    'x-geo-country',
  ]
  for (const k of keys) {
    const v = String(headers.get(k) ?? '')
      .trim()
      .toUpperCase()
    if (v && v !== 'XX' && v !== 'T1') return v
  }
  return ''
}

/** 客户端 IP（优先 x-forwarded-for） */
export function clientIpFromHeaders(headers: Headers): string {
  const forwarded = String(headers.get('x-forwarded-for') ?? '').trim()
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim() || ''
    if (first) return first.replace(/^::ffff:/i, '')
  }
  const real = String(headers.get('x-real-ip') ?? '')
    .trim()
    .replace(/^::ffff:/i, '')
  return real
}

function isPrivateOrLocalIp(ip: string): boolean {
  const v = ip.trim().toLowerCase()
  if (!v) return true
  if (v === '::1' || v === 'localhost') return true
  if (v.startsWith('127.')) return true
  if (v.startsWith('10.')) return true
  if (v.startsWith('192.168.')) return true
  if (v.startsWith('169.254.')) return true
  const m = /^172\.(\d+)\./.exec(v)
  if (m) {
    const n = Number(m[1])
    if (n >= 16 && n <= 31) return true
  }
  return false
}

/**
 * 无 CDN 国家头时，用公网 IP 查国家（ip-api，失败则空串）
 */
export async function lookupCountryByIp(ip: string): Promise<string> {
  const clean = String(ip || '')
    .trim()
    .replace(/^::ffff:/i, '')
  if (!clean || isPrivateOrLocalIp(clean)) return ''
  try {
    const url = `http://ip-api.com/json/${encodeURIComponent(clean)}?fields=status,countryCode`
    const res = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(2500),
    })
    if (!res.ok) return ''
    const json = (await res.json()) as {
      status?: string
      countryCode?: string
    }
    if (json?.status !== 'success') return ''
    return String(json.countryCode ?? '')
      .trim()
      .toUpperCase()
  } catch {
    return ''
  }
}

/** 解析请求国家码：CDN 头 → IP 查询 */
export async function resolveRequestCountry(
  headers: Headers,
): Promise<string> {
  const fromHeader = countryFromHeaders(headers)
  if (fromHeader) return fromHeader
  const ip = clientIpFromHeaders(headers)
  return lookupCountryByIp(ip)
}
