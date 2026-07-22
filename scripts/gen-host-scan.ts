/**
 * 生成 src/lib/host/scan.ts（相对路径 import，供 bun build 打进同一模块图）
 * bun scripts/gen-host-scan.ts
 */
import { Glob } from 'bun'
import { mkdirSync, writeFileSync } from 'node:fs'

const OUT = 'src/lib/host/scan.ts'

const services = [...new Glob('src/modules/*/service/**/*.ts').scanSync()].sort()
const admin = [
  ...new Glob('src/modules/*/controller/admin/**/*.ts').scanSync(),
].sort()
const app = [
  ...new Glob('src/modules/*/controller/app/**/*.ts').scanSync(),
].sort()

/** scan.ts 在 src/lib/host/，到 modules 用 ../../；保留 .ts 供 Bun 打包解析 */
function importPath(p: string) {
  return '../../' + p.replace(/^src\//, '')
}

const lines: string[] = [
  '/**',
  ' * 由 scripts/gen-host-scan.ts 生成 — 勿手改',
  ' * 重新生成: bun scripts/gen-host-scan.ts',
  ' */',
  '// @ts-nocheck — 生成物：动态 import 清单，不参与类型检查',
  'import {',
  '  parseModuleFromPath,',
  '  setControllerScanContext,',
  '} from "/#/server"',
  '',
  'const services: Array<() => Promise<unknown>> = [',
]

for (const f of services) {
  lines.push(`  () => import("${importPath(f)}"),`)
}
lines.push(']', '')

lines.push(
  'const adminControllers: Array<{ file: string; load: () => Promise<unknown> }> = [',
)
for (const f of admin) {
  const file = f.replace(/^src\//, '')
  lines.push(
    `  { file: "${file}", load: () => import("${importPath(f)}") },`,
  )
}
lines.push(']', '')

lines.push(
  'const appControllers: Array<{ file: string; load: () => Promise<unknown> }> = [',
)
for (const f of app) {
  const file = f.replace(/^src\//, '')
  lines.push(
    `  { file: "${file}", load: () => import("${importPath(f)}") },`,
  )
}
lines.push(']', '')

lines.push(
  'async function loadControllers(',
  '  side: "admin" | "app",',
  '  items: Array<{ file: string; load: () => Promise<unknown> }>,',
  ') {',
  '  for (const { file, load } of items) {',
  '    setControllerScanContext({',
  '      module: parseModuleFromPath(file),',
  '      side,',
  '      file,',
  '    })',
  '    try {',
  '      await load()',
  '    } finally {',
  '      setControllerScanContext(null)',
  '    }',
  '  }',
  '}',
  '',
  '/** registerHost({ scan: loadHostModules }) */',
  'export async function loadHostModules() {',
  '  for (const load of services) await load()',
  '  await loadControllers("admin", adminControllers)',
  '  await loadControllers("app", appControllers)',
  '  console.log(',
  '    `[Host] scan ← ${services.length} service, ${adminControllers.length + appControllers.length} controller (bundled)`,',
  '  )',
  '}',
  '',
)

mkdirSync('src/lib/host', { recursive: true })
writeFileSync(OUT, lines.join('\n'))
console.log(
  `[gen-host-scan] → ${OUT} services=${services.length} admin=${admin.length} app=${app.length}`,
)
