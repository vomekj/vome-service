import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { VomeConfig, scanFiles } from '/#/server'
import type { DbConfig } from '../../../../typings/config/db'

const DIR = import.meta.dir
const INDEX = join(DIR, 'index.ts')

const toImportPath = (file: string, cwd: string) => {
  const rel = relative(DIR, join(cwd, file)).replace(/\\/g, '/').replace(/\.tsx?$/, '')
  return rel.startsWith('.') ? rel : `./${rel}`
}

const renderExports = async (files: string[], cwd: string) => {
  if (files.length === 0) return readFile(join(DIR, 'empty.tpl'), 'utf8')
  return files.map(file => `export * from '${toImportPath(file, cwd)}'`).join('\n')
}

/** 扫描实体并生成 schema/index.ts */
export async function buildSchemaIndex() {
  const cwd = process.cwd()
  const { schema: pattern } = VomeConfig.db as DbConfig
  const files = await scanFiles(pattern, { cwd })

  const [template, exports] = await Promise.all([
    readFile(join(DIR, 'template.tpl'), 'utf8'),
    renderExports(files, cwd),
  ])

  await mkdir(dirname(INDEX), { recursive: true })
  await writeFile(INDEX, template.replace('__EXPORTS__', exports.trimEnd()))
  console.log(`[db] schema index ← ${files.length} module(s)`)
  return files.length
}
