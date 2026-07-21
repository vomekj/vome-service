import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { VomeConfig, scanFiles } from '/#/server'
import type { DbConfig } from '../../../../typings/config/db'

/** 固定相对项目根，避免 bun build 后 import.meta.dir 落到 dist/ */
const SCHEMA_DIR = join(process.cwd(), 'src/lib/db/schema')
const INDEX = join(SCHEMA_DIR, 'index.ts')

async function exists(path: string) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

const toImportPath = (file: string, cwd: string) => {
  const rel = relative(SCHEMA_DIR, join(cwd, file))
    .replace(/\\/g, '/')
    .replace(/\.tsx?$/, '')
  return rel.startsWith('.') ? rel : `./${rel}`
}

const renderExports = async (files: string[], cwd: string) => {
  if (files.length === 0) {
    return readFile(join(SCHEMA_DIR, 'empty.tpl'), 'utf8')
  }
  return files
    .map((file) => `export * from '${toImportPath(file, cwd)}'`)
    .join('\n')
}

/**
 * 扫描实体并生成 schema/index.ts。
 * 无源码模板时（纯 dist/binary 部署）跳过，沿用打包进 bundle 的 schema。
 */
export async function buildSchemaIndex() {
  const templatePath = join(SCHEMA_DIR, 'template.tpl')
  if (!(await exists(templatePath))) {
    console.log('[db] schema index ← bundled (skip regenerate)')
    return 1
  }

  const cwd = process.cwd()
  const { schema: pattern } = VomeConfig.db as DbConfig
  const files = await scanFiles(pattern, { cwd })

  const [template, exports] = await Promise.all([
    readFile(templatePath, 'utf8'),
    renderExports(files, cwd),
  ])

  await mkdir(dirname(INDEX), { recursive: true })
  await writeFile(INDEX, template.replace('__EXPORTS__', exports.trimEnd()))
  console.log(`[db] schema index ← ${files.length} module(s)`)
  return files.length
}
