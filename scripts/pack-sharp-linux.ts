/**
 * 为 docker:pack 准备 linux-x64 sharp（Mac/Win 交叉编译无法内嵌原生库）
 * 产物：dist/node_modules/{sharp,@img,...}
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { $ } from 'bun'

const root = join(import.meta.dir, '..')
const dist = join(root, 'dist')
const nm = join(dist, 'node_modules')

if (!existsSync(join(dist, 'index.js'))) {
  console.error('[pack-sharp-linux] 缺少 dist/index.js，请先 build:obfuscate')
  process.exit(1)
}

const pkg = JSON.parse(
  await Bun.file(join(root, 'package.json')).text(),
) as { dependencies?: Record<string, string> }
const sharpRange = pkg.dependencies?.sharp
if (!sharpRange) {
  console.error('[pack-sharp-linux] package.json 无 sharp 依赖')
  process.exit(1)
}

rmSync(nm, { recursive: true, force: true })
mkdirSync(dist, { recursive: true })
writeFileSync(
  join(dist, 'package.json'),
  JSON.stringify(
    { name: 'vome-service-runtime', private: true, dependencies: { sharp: sharpRange } },
    null,
    2,
  ),
)

const r = await $`npm install --omit=dev --os=linux --cpu=x64 --libc=glibc`.cwd(dist).nothrow()
if (r.exitCode !== 0) {
  console.error('[pack-sharp-linux] npm install sharp 失败')
  process.exit(r.exitCode ?? 1)
}

const linuxSharp = join(nm, '@img', 'sharp-linux-x64')
if (!existsSync(linuxSharp)) {
  console.error('[pack-sharp-linux] 未找到 @img/sharp-linux-x64，安装平台可能不对')
  process.exit(1)
}

console.log('[pack-sharp-linux] ok ← dist/node_modules (linux-x64 sharp)')
