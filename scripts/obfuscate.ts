import { join } from 'node:path'
import { existsSync } from 'node:fs'
import JavaScriptObfuscator from 'javascript-obfuscator'
import { obfuscatorOptions } from './obfuscator.options'

const file = join(import.meta.dir, '..', 'dist', 'index.js')
if (!existsSync(file)) {
  console.error('[obfuscate] 缺少 dist/index.js，请先 bun run build')
  process.exit(1)
}

const code = await Bun.file(file).text()
const result = JavaScriptObfuscator.obfuscate(code, obfuscatorOptions)
await Bun.write(file, result.getObfuscatedCode())
console.log('[obfuscate] done ←', file)
