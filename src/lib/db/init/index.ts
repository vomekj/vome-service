import { VomeConfig, scanFiles } from '/#/server'
import type { SQL } from 'bun'
import type { createDrizzle } from '../client'
import { importModuleDb, seedEmptyTablesFromModuleDb } from './import-db'
import { importModuleMenu } from './import-menu'
import { isModuleInitialized, markModuleInitialized } from './judge'

type Db = ReturnType<typeof createDrizzle>

type VomeInitConfig = {
  initDB?: boolean
  initMenu?: boolean
  initJudge?: string
}

const DB_JSON = '**/modules/*/db.json'
const MENU_JSON = '**/modules/*/menu.json'

function moduleName(file: string) {
  const matched = file.match(/modules\/([^/]+)\/(?:db|menu)\.json$/)
  if (!matched) throw new Error(`[init] 无法解析模块名: ${file}`)
  return matched[1]
}

export async function initModules(options: {
  db: Db
  schema: Record<string, unknown>
  sql?: SQL
}) {
  const vome = (VomeConfig.vome ?? {}) as VomeInitConfig
  const judge = vome.initJudge ?? 'lock'
  const cwd = process.cwd()

  if (vome.initDB) {
    const files = await scanFiles(DB_JSON, { cwd, ext: /\.json$/ })
    for (const file of files) {
      const name = moduleName(file)
      if (!(await isModuleInitialized(name, 'db', judge, options.sql))) {
        await importModuleDb(file, options.db, options.schema)
        await markModuleInitialized(name, 'db', judge, options.sql)
        console.log(`[init] db ← ${name}`)
      }
      // 模块已初始化后，db.json 新增表仍可补种
      await seedEmptyTablesFromModuleDb(file, options.db, options.schema)
    }
  }

  if (vome.initMenu) {
    const files = await scanFiles(MENU_JSON, { cwd, ext: /\.json$/ })
    for (const file of files) {
      const name = moduleName(file)
      if (await isModuleInitialized(name, 'menu', judge, options.sql)) {
        continue
      }
      const ok = await importModuleMenu(file, options.db, options.schema, name)
      if (!ok) continue
      await markModuleInitialized(name, 'menu', judge, options.sql)
      console.log(`[init] menu ← ${name}`)
    }
  }
}
