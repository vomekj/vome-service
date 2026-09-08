/** 外链图片转存（语种国旗等）；无压缩依赖，直接走上传插件 downAndUpload */

export type UploadDownPlugin = {
  downAndUpload?: (url: string, fileName?: string) => Promise<string>
}

function trimStr(raw: unknown) {
  return String(raw ?? '').trim()
}

function extFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname
    const m = path.match(/\.([a-zA-Z0-9]{2,5})$/)
    if (m) return `.${m[1]!.toLowerCase()}`
  } catch {
    // ignore
  }
  return '.webp'
}

/**
 * 外链 http(s) 转存到本桶指定前缀。
 * 仅接受 http(s) 或站点相对路径 `/…`；其它（emoji 等）一律清空。
 */
export async function transferRemoteImage(opts: {
  getPlugin: () => Promise<UploadDownPlugin>
  raw: string
  prefixPath: string
}): Promise<string> {
  const url = trimStr(opts.raw)
  if (!url) return ''
  if (url.startsWith('/')) return url
  if (!/^https?:\/\//i.test(url)) return ''
  const prefix = String(opts.prefixPath || '')
    .replace(/^\/+|\/+$/g, '')
    .trim()
  if (!prefix) return url
  if (url.includes(`/${prefix}/`)) return url

  const plugin = await opts.getPlugin()
  if (!plugin.downAndUpload) return url
  const key = `${prefix}/${crypto.randomUUID()}${extFromUrl(url)}`
  return plugin.downAndUpload(url, key)
}
