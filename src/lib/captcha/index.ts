/**
 * 图片验证码（svg-captcha 风格 + 内置混合四则运算）
 *
 * 1-9 加减乘除随机；÷ 用几何路径绘制（svg-captcha 字体无该字符）
 * 字体从 cwd/assets/captcha 加载。
 * 禁止 require('svg-captcha/lib/random')：它会拉 option-manager，
 * bun compile 会把本机 __dirname/fonts 绝对路径打进二进制，Docker 必崩。
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const opentype = require('opentype.js')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const chToPath = require('svg-captcha/lib/ch-to-path')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const charPreset = require('svg-captcha/lib/char-preset')

function resolveCaptchaFontPath(): string {
  const candidates = [
    join(process.cwd(), 'assets/captcha/Comismsh.ttf'),
    join(process.cwd(), 'node_modules/svg-captcha/fonts/Comismsh.ttf'),
  ]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  throw new Error(
    '[captcha] 缺少字体 Comismsh.ttf（期望 assets/captcha/ 或 node_modules/svg-captcha/fonts/）',
  )
}

/** 自研 random（仅 int/color），避免拉进 option-manager */
function captchaInt(min: number, max: number) {
  return Math.round(min + Math.random() * (max - min))
}

function captchaHue2rgb(p: number, q: number, h: number) {
  h = (h + 1) % 1
  if (h * 6 < 1) return p + (q - p) * h * 6
  if (h * 2 < 1) return q
  if (h * 3 < 2) return p + (q - p) * (2 / 3 - h) * 6
  return p
}

function captchaGetLightness(rgbColor: string) {
  if (rgbColor[0] !== '#') return 1.0
  let hex = rgbColor.slice(1)
  if (hex.length === 3) {
    hex = hex[0]! + hex[0]! + hex[1]! + hex[1]! + hex[2]! + hex[2]!
  }
  const n = parseInt(hex, 16)
  const r = n >> 16
  const g = (n >> 8) & 255
  const b = n & 255
  return (Math.max(r, g, b) + Math.min(r, g, b)) / (2 * 255)
}

function captchaColor(bgColor?: string) {
  const hue = captchaInt(0, 24) / 24
  const saturation = captchaInt(60, 80) / 100
  const bgLightness = bgColor ? captchaGetLightness(bgColor) : 1.0
  let minLightness: number
  let maxLightness: number
  if (bgLightness >= 0.5) {
    minLightness = Math.round(bgLightness * 100) - 45
    maxLightness = Math.round(bgLightness * 100) - 25
  } else {
    minLightness = Math.round(bgLightness * 100) + 25
    maxLightness = Math.round(bgLightness * 100) + 45
  }
  const lightness = captchaInt(minLightness, maxLightness) / 100
  const q =
    lightness < 0.5
      ? lightness * (lightness + saturation)
      : lightness + saturation - lightness * saturation
  const p = 2 * lightness - q
  const r = Math.floor(captchaHue2rgb(p, q, hue + 1 / 3) * 255)
  const g = Math.floor(captchaHue2rgb(p, q, hue) * 255)
  const b = Math.floor(captchaHue2rgb(p, q, hue - 1 / 3) * 255)
  const c = ((b | (g << 8) | (r << 16) | (1 << 24)) >>> 0)
    .toString(16)
    .slice(1)
  return `#${c}`
}

let captchaBaseOptions: Record<string, unknown> | null = null

function getCaptchaBaseOptions() {
  if (captchaBaseOptions) return captchaBaseOptions
  const captchaFont = opentype.loadSync(resolveCaptchaFontPath())
  captchaBaseOptions = {
    width: 150,
    height: 50,
    noise: 1,
    color: false,
    background: '',
    size: 4,
    ignoreChars: '',
    fontSize: 56,
    charPreset,
    font: captchaFont,
    ascender: captchaFont.ascender,
    descender: captchaFont.descender,
  }
  return captchaBaseOptions
}

const DIVIDE_CHAR = '÷'

/** 深色多色调色板（白底可读） */
const CAPTCHA_DARK_PALETTE = [
  '#1a1a2e',
  '#16213e',
  '#2d3436',
  '#4527a0',
  '#283593',
  '#1b5e20',
  '#4a148c',
  '#880e4f',
  '#37474f',
]

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/** 1-9 加减乘除，随机混合 */
export function generateMixedMathCaptcha() {
  const op = randomInt(0, 3)
  switch (op) {
    case 0: {
      const a = randomInt(1, 9)
      const b = randomInt(1, 9)
      return { expr: `${a}+${b}=?`, answer: String(a + b) }
    }
    case 1: {
      let a = randomInt(1, 9)
      let b = randomInt(1, 9)
      if (a < b) [a, b] = [b, a]
      return { expr: `${a}-${b}=?`, answer: String(a - b) }
    }
    case 2: {
      const a = randomInt(1, 9)
      const b = randomInt(1, 9)
      return { expr: `${a}x${b}=?`, answer: String(a * b) }
    }
    default: {
      const b = randomInt(1, 9)
      const answer = randomInt(1, 9)
      const a = b * answer
      return { expr: `${a}÷${b}=?`, answer: String(answer) }
    }
  }
}

function buildDivideSymbolSvg(
  x: number,
  y: number,
  color: string,
  fontSize: number,
) {
  const scale = fontSize / 48
  const gap = 7 * scale
  const dotR = 2.2 * scale
  const halfW = 7.5 * scale
  const ringStroke = 1.5 * scale
  const barStroke = 3.8 * scale
  return [
    `<circle cx="${x}" cy="${y - gap}" r="${dotR}" fill="none" stroke="${color}" stroke-width="${ringStroke}"/>`,
    `<line x1="${x - halfW}" y1="${y}" x2="${x + halfW}" y2="${y}" stroke="${color}" stroke-width="${barStroke}" stroke-linecap="round"/>`,
    `<circle cx="${x}" cy="${y + gap}" r="${dotR}" fill="none" stroke="${color}" stroke-width="${ringStroke}"/>`,
  ].join('')
}

function buildCaptchaNoiseLines(
  width: number,
  height: number,
  noise: number,
  bg?: string,
) {
  const lines: string[] = []
  for (let i = 0; i < noise; i++) {
    const start = `${captchaInt(1, 21)} ${captchaInt(1, height - 1)}`
    const end = `${captchaInt(width - 21, width - 1)} ${captchaInt(1, height - 1)}`
    const mid1 = `${captchaInt(width / 2 - 21, width / 2 + 21)} ${captchaInt(1, height - 1)}`
    const mid2 = `${captchaInt(width / 2 - 21, width / 2 + 21)} ${captchaInt(1, height - 1)}`
    const color = captchaColor(bg)
    lines.push(
      `<path d="M${start} C${mid1},${mid2},${end}" stroke="${color}" fill="none"/>`,
    )
  }
  return lines
}

function renderCaptchaSvg(text: string, options: Record<string, unknown>) {
  const opts = Object.assign({}, getCaptchaBaseOptions(), options)
  const width = Number(opts.width) || 150
  const height = Number(opts.height) || 50
  const bg = opts.background as string | undefined
  const noise = Number(opts.noise) || 3
  const fontSize = Number(opts.fontSize) || 56
  if (bg) opts.color = true

  const len = text.length
  const spacing = (width - 2) / (len + 1)
  const textPaths: string[] = []

  for (let i = 0; i < len; i++) {
    const x = spacing * (i + 1)
    const y = height / 2
    const color = captchaColor(bg)
    const ch = text[i]!

    if (ch === DIVIDE_CHAR) {
      textPaths.push(buildDivideSymbolSvg(x, y, color, fontSize))
    } else {
      const charPath = chToPath(ch, Object.assign({ x, y, fontSize }, opts))
      textPaths.push(`<path fill="${color}" d="${charPath}"/>`)
    }
  }

  const bgRect = bg ? `<rect width="100%" height="100%" fill="${bg}"/>` : ''
  const paths = buildCaptchaNoiseLines(width, height, noise, bg)
    .concat(textPaths)
    .join('')
  const data = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0,0,${width},${height}">${bgRect}${paths}</svg>`

  return { data, text }
}

function applyCaptchaColors(svgData: string, lightText: boolean, color: string) {
  const rpList = [
    '#111',
    '#222',
    '#333',
    '#444',
    '#555',
    '#666',
    '#777',
    '#888',
    '#999',
  ]
  let data = svgData
  if (lightText) {
    for (const rp of rpList) data = data.split(rp).join(color || '#fff')
    return data
  }
  rpList.forEach((rp, index) => {
    data = data
      .split(rp)
      .join(CAPTCHA_DARK_PALETTE[index % CAPTCHA_DARK_PALETTE.length]!)
  })
  return data
}

export type CaptchaImageResult = {
  captchaId: string
  data: string
  /** 仅内部校验用，勿下发给客户端 */
  answer: string
}

/**
 * 生成混合运算图片验证码（答案不返回给前端）
 */
export function createCaptchaImage(options?: {
  width?: number
  height?: number
  color?: string
}): CaptchaImageResult {
  const w = Number(options?.width) || 150
  const h = Number(options?.height) || 50
  const color = options?.color || '#333333'
  const { expr, answer } = generateMixedMathCaptcha()

  const svg = renderCaptchaSvg(expr, {
    width: w,
    height: h,
    noise: 3,
    color: true,
    background: '#ffffff',
    fontSize: Math.max(42, Math.floor(h * 0.72)),
  })

  const normalizedColor = color.toLowerCase()
  const lightText =
    normalizedColor === '#fff' || normalizedColor === '#ffffff'

  const svgData = applyCaptchaColors(
    svg.data.replace(/"/g, "'"),
    lightText,
    color,
  )
  const base64Data = Buffer.from(svgData).toString('base64')

  return {
    captchaId: crypto.randomUUID(),
    data: `data:image/svg+xml;base64,${base64Data}`,
    answer: answer.toLowerCase(),
  }
}
