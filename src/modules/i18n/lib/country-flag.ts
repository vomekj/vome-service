import { CommException } from '@core/server'

/** Flagcdn 要求小写国家码 */
export function toFlagcdnCode(countryCode: unknown): string {
  return String(countryCode ?? '').trim().toLowerCase()
}

/** 国家码 → Flagcdn 图片 URL */
export function flagCdnUrl(countryCode: unknown): string {
  const code = toFlagcdnCode(countryCode)
  if (!code) throw new CommException('国家码不能为空')
  return `https://flagcdn.com/w40/${code}.png`
}

/** 无 flag 时按国家码拼 Flagcdn；有外链则交 transfer 转存 */
export async function ensureFlagFromCountryCode(opts: {
  countryCode: unknown
  flag?: unknown
  transfer: (url: string) => Promise<string>
}): Promise<string> {
  const existing = String(opts.flag ?? '').trim()
  if (existing) return opts.transfer(existing)
  return opts.transfer(flagCdnUrl(opts.countryCode))
}
