import { randomUUID } from 'node:crypto'
import { unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { CommException } from '@core/server'

function trimStr(raw: unknown): string {
  return String(raw ?? '').trim()
}

export type UploadDownPlugin = {
  downAndUpload?: (url: string, fileName?: string) => Promise<string>
}

type CompressResult = {
  buffer: Buffer
  ext: string
}

/** 对齐 admin compress-image：maxSizeMB: 0.05 */
const MAX_BYTES = Math.floor(0.05 * 1024 * 1024)
/** 对齐 admin initialQuality: 1 */
const INITIAL_QUALITY = 100

/**
 * 在不缩分辨率前提下，按 quality 迭代逼近 maxSizeMB（对齐 browser-image-compression）
 */
async function encodeUnderMax(
  input: Buffer,
  kind: 'webp' | 'jpeg',
): Promise<Buffer> {
  let quality = INITIAL_QUALITY
  let best = await sharp(input, { failOn: 'none' })
    [kind]({ quality })
    .toBuffer()

  while (best.length > MAX_BYTES && quality > 20) {
    quality -= 10
    const next = await sharp(input, { failOn: 'none' })
      [kind]({ quality })
      .toBuffer()
    if (next.length < best.length) best = next
    if (next.length <= MAX_BYTES) return next
  }
  return best
}

/**
 * 对齐 admin `compress-image.ts`：
 * - PNG/BMP → WebP（fileType）
 * - initialQuality 0.8、maxSizeMB 0.05、alwaysKeepResolution（不缩边）
 */
export async function compressTransferBuffer(
  input: Buffer,
): Promise<CompressResult> {
  let format = ''
  try {
    const meta = await sharp(input, { failOn: 'none' }).metadata()
    format = String(meta.format ?? '').toLowerCase()
  } catch {
    return { buffer: input, ext: 'bin' }
  }

  if (format === 'png' || format === 'bmp') {
    return {
      buffer: await encodeUnderMax(input, 'webp'),
      ext: 'webp',
    }
  }

  if (format === 'jpeg' || format === 'jpg') {
    return {
      buffer: await encodeUnderMax(input, 'jpeg'),
      ext: 'jpg',
    }
  }

  if (format === 'webp') {
    return {
      buffer: await encodeUnderMax(input, 'webp'),
      ext: 'webp',
    }
  }

  // gif 等保持原样（避免动图被压成单帧）
  return { buffer: input, ext: format || 'bin' }
}

function withExt(filePath: string | undefined, ext: string): string {
  const e = ext.replace(/^\./, '') || 'bin'
  const raw = String(filePath ?? '').trim()
  if (!raw) return `${randomUUID()}.${e}`
  if (/\.[a-zA-Z0-9]{2,5}$/.test(raw)) {
    return raw.replace(/\.[a-zA-Z0-9]{2,5}$/, `.${e}`)
  }
  return `${raw}.${e}`
}

/** URL 路径扩展名；PNG/BMP 转存后统一 .webp */
export function extFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname
    const m = path.match(/\.([a-zA-Z0-9]{2,5})$/)
    if (m) {
      const e = m[1]!.toLowerCase()
      if (e === 'png' || e === 'bmp') return '.webp'
      return `.${e}`
    }
  } catch {
    // ignore
  }
  return '.webp'
}

/**
 * 下载 → 压缩（对齐 admin）→ 写入存储桶。
 * 插件 `downAndUpload` 支持本地路径。
 * 上传返回后探测对象是否可访问，避免「只写了 URL、桶里没有文件」。
 */
export async function downCompressAndUpload(
  plugin: UploadDownPlugin,
  url: string,
  filePath?: string,
): Promise<string> {
  if (!plugin.downAndUpload) {
    throw new Error('上传插件不支持按 URL 转存')
  }

  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`下载失败: ${res.status}`)
  }
  const raw = Buffer.from(await res.arrayBuffer())
  const { buffer, ext } = await compressTransferBuffer(raw)
  const key = withExt(filePath, ext)
  const tmp = join(tmpdir(), `vm-xfer-${randomUUID()}.${ext}`)
  writeFileSync(tmp, buffer)
  let out = ''
  try {
    out = String((await plugin.downAndUpload(tmp, key)) ?? '').trim()
  } finally {
    try {
      unlinkSync(tmp)
    } catch {
      // ignore
    }
  }
  if (!out) throw new Error('上传插件未返回地址')
  await assertObjectReachable(out)
  return out
}

/** 确认对象可读（部分 S3/RustFS 对 HEAD 不友好，再试 Range GET） */
async function assertObjectReachable(url: string): Promise<void> {
  try {
    const head = await fetch(url, { method: 'HEAD' })
    if (head.ok) return
  } catch {
    // fall through
  }
  try {
    const get = await fetch(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-0' },
    })
    if (get.ok || get.status === 206) return
    throw new Error(`HTTP ${get.status}`)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`上传后对象不可访问（${msg}）：${url}`)
  }
}

/**
 * 外链 http(s) 图片转存到本桶指定前缀。
 * 仅接受 http(s) 或站点相对路径 `/…`；其它（emoji 等）一律清空。
 * skin / 国旗等共用，禁止再各抄一份。
 *
 * 注意：不可仅因 URL 路径含 prefix 就跳过——死链也会带 prefix，跳过会导致库有地址、桶无文件。
 */
export async function transferRemoteImage(opts: {
  getPlugin: () => Promise<UploadDownPlugin>
  raw: string
  prefixPath: string
  failLabel: string
}): Promise<string> {
  const url = trimStr(opts.raw)
  if (!url) return ''
  if (url.startsWith('/')) return url
  if (!/^https?:\/\//i.test(url)) return ''
  const prefix = String(opts.prefixPath || '')
    .replace(/^\/+|\/+$/g, '')
    .trim()
  if (!prefix) return url

  // 已是本前缀：仅当对象真实可读才跳过；否则报错（死链无法当源重新下）
  if (url.includes(`/${prefix}/`)) {
    try {
      await assertObjectReachable(url)
      return url
    } catch {
      throw new CommException(
        `${opts.failLabel}失败：地址已指向本桶前缀但对象不存在，请换可访问的外链图片后重新导入：${url}`,
      )
    }
  }

  try {
    const plugin = await opts.getPlugin()
    if (!plugin.downAndUpload) return url
    const key = `${prefix}/${randomUUID()}${extFromUrl(url)}`
    return await downCompressAndUpload(plugin, url, key)
  } catch (e) {
    if (e instanceof CommException) throw e
    const msg = e instanceof Error ? e.message : String(e)
    throw new CommException(`${opts.failLabel}失败：${msg}`)
  }
}
