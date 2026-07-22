/**
 * 生成 src/host-scan.ts（相对路径 import，供 bun build 打进同一模块图）
 * bun scripts/gen-host-scan.ts
 */
import { Glob } from 'bun'
import { writeFileSync } from 'node:fs'

const services = [...new Glob('src/modules/*/service/**/*.ts').scanSync()].sort()
const admin = [
  ...new Glob('src/modules/*/controller/admin/**/*.ts').scanSync(),
].sort()
const app = [
  ...new Glob('src/modules/*/controller/app/**/*.ts').scanSync(),
].sort()

function rel(p: string) {
  return './' + p.replace(/^src\//, '')
}

const lines: string[] = [
  '/**',
  ' * 由 scripts/gen-host-scan.ts 生成 — 勿手改',
  ' * 重新生成: bun scripts/gen-host-scan.ts',
  ' */',
  'import {',
  '  parseModuleFromPath,',
  '  setControllerScanContext,',
  '} from \"/#/server\"',
  '',
  'const services: Array<() => Promise<unknown>> = [',
]

for (const f of services) {
  lines.push(`  () => import(\"${rel(f)}\"),`)
}
lines.push(']', '')

lines.push(
  'const adminControllers: Array<{ file: string; load: () => Promise<unknown> }> = [',
)
for (const f of admin) {
  const file = f.replace(/^src\//, '')
  lines.push(
    `  { file: \"${file}\", load: () => import(\"${rel(f)}\") },`,
  )
}
lines.push(']', '')

lines.push(
  'const appControllers: Array<{ file: string; load: () => Promise<unknown> }> = [',
)
for (const f of app) {
  const file = f.replace(/^src\//, '')
  lines.push(
    `  { file: \"${file}\", load: () => import(\"${rel(f)}\") },`,
  )
}
lines.push(']', '')

lines.push(
  'async function loadControllers(',
  '  side: \"admin\" | \"app\",',
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
  '  await loadControllers(\"admin\", adminControllers)',
  '  await loadControllers(\"app\", appControllers)',
  '  console.log(',
  '    `[Host] scan ← ${services.length} service, ${adminControllers.length + appControllers.length} controller (bundled)`,',
  '  )',
  '}',
  '',
)

writeFileSync('src/host-scan.ts', lines.join('\n'))
console.log(
  `[gen-host-scan] services=${services.length} admin=${admin.length} app=${app.length}`,
)
