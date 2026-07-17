/**
 * 图片验证码（svg-captcha 风格 + 内置混合四则运算）
 *
 * 1-9 加减乘除随机；÷ 用几何路径绘制（svg-captcha 字体无该字符）
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const chToPath = require('svg-captcha/lib/ch-to-path')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const captchaRandom = require('svg-captcha/lib/random')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const captchaOptionMngr = require('svg-captcha/lib/option-manager')

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
    const start = `${captchaRandom.int(1, 21)} ${captchaRandom.int(1, height - 1)}`
    const end = `${captchaRandom.int(width - 21, width - 1)} ${captchaRandom.int(1, height - 1)}`
    const mid1 = `${captchaRandom.int(width / 2 - 21, width / 2 + 21)} ${captchaRandom.int(1, height - 1)}`
    const mid2 = `${captchaRandom.int(width / 2 - 21, width / 2 + 21)} ${captchaRandom.int(1, height - 1)}`
    const color = captchaRandom.color(bg)
    lines.push(
      `<path d="M${start} C${mid1},${mid2},${end}" stroke="${color}" fill="none"/>`,
    )
  }
  return lines
}

function renderCaptchaSvg(text: string, options: Record<string, unknown>) {
  const opts = Object.assign({}, captchaOptionMngr.options, options)
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
    const color = captchaRandom.color(bg)
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
