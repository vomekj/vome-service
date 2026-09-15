import { VomeConfig, scanFiles, normalizeScanPath } from '@core/server'
import type { SQL } from 'bun'
import type { createDrizzle } from '../client'
import { importModuleDb } from './import-db'
import { importModuleMenu } from './import-menu'
import { loadInitFlagSet, markModuleInitialized } from './judge'

type Db = ReturnType<typeof createDrizzle>

type VomeInitConfig = {
  initDB?: boolean
  initMenu?: boolean
  initJudge?: string
}

const DB_JSON = '**/modules/*/db.json'
const MENU_JSON = '**/modules/*/menu.json'

/** modules/activity/db.json → activity（对应标记 initDB:activity） */
function moduleName(file: string) {
  const matched = normalizeScanPath(file).match(/modules\/([^/]+)\/(?:db|menu)\.json$/)
  if (!matched) throw new Error(`[init] 无法解析模块名: ${file}`)
  return matched[1]
}

/**
 * 仅首次初始化种入：已标记 initDB:模块名 / initMenu:模块名 的路径整文件跳过
 *（不读 json 内容、不按表数据判断）。启动时一次拉齐标记到内存。
 * 重种需清 base_conf 对应键（或 lock）后重启。
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
    const done = await loadInitFlagSet('db', judge, options.sql)
    const files = await scanFiles(DB_JSON, { cwd, ext: /\.json$/ })
    for (const file of files) {
      const name = moduleName(file)
      if (done.has(name)) continue
      await importModuleDb(file, options.db, options.schema)
      await markModuleInitialized(name, 'db', judge, options.sql)
      done.add(name)
      console.log(`[init] db ← ${name}`)
    }
  }

  if (vome.initMenu) {
    const done = await loadInitFlagSet('menu', judge, options.sql)
    const files = await scanFiles(MENU_JSON, { cwd, ext: /\.json$/ })
    for (const file of files) {
      const name = moduleName(file)
      if (done.has(name)) continue
      const ok = await importModuleMenu(file, options.db, options.schema, name)
      if (!ok) continue
      await markModuleInitialized(name, 'menu', judge, options.sql)
      done.add(name)
      console.log(`[init] menu ← ${name}`)
    }
  }
}
