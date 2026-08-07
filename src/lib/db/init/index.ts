import { VomeConfig, scanFiles } from '@core/server'
import type { SQL } from 'bun'
import type { createDrizzle } from '../client'
import { importModuleDb } from './import-db'
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

/**
 * 仅首次初始化种入：模块已标记 init 后不再补种、不增量。
 * 重种需清 base_conf 的 initDB:* / initMenu:*（或 lock）后重启。
 */
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
      if (await isModuleInitialized(name, 'db', judge, options.sql)) continue
      await importModuleDb(file, options.db, options.schema)
      await markModuleInitialized(name, 'db', judge, options.sql)
      console.log(`[init] db ← ${name}`)
    }
  }

  if (vome.initMenu) {
    const files = await scanFiles(MENU_JSON, { cwd, ext: /\.json$/ })
    for (const file of files) {
      const name = moduleName(file)
      if (await isModuleInitialized(name, 'menu', judge, options.sql)) continue
      const ok = await importModuleMenu(file, options.db, options.schema, name)
      if (!ok) continue
      await markModuleInitialized(name, 'menu', judge, options.sql)
      console.log(`[init] menu ← ${name}`)
    }
  }
}
