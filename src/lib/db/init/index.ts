import { VomeConfig, scanFiles, normalizeScanPath } from '@core/server'
import type { SQL } from 'bun'
import { and, eq, getTableColumns, isNull, or } from 'drizzle-orm'
import type { createDrizzle } from '../client'
import { importModuleDb } from './import-db'
import { importModuleMenu } from './import-menu'
import { loadInitFlagSet, markModuleInitialized } from './judge'
import { buildTableMap } from './table-map'

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

/** 语种种子国旗转存依赖 upload；init 阶段插件尚未加载，查库判断 */
async function hasEnabledUploadPlugin(
  db: Db,
  schema: Record<string, unknown>,
): Promise<boolean> {
  const table = buildTableMap(schema).get('base_plugin_info')
  if (!table) return false
  const cols = getTableColumns(table)
  if (!cols.id || !cols.keyName || !cols.status) return false
  const keyOrHook = cols.hook
    ? or(eq(cols.keyName, 'upload'), eq(cols.hook, 'upload'))
    : eq(cols.keyName, 'upload')
  const cond =
    cols.deleteTime != null
      ? and(eq(cols.status, 1), keyOrHook, isNull(cols.deleteTime))
      : and(eq(cols.status, 1), keyOrHook)
  try {
    const rows = await (db as {
      select: (sel: Record<string, unknown>) => {
        from: (t: unknown) => {
          where: (c: unknown) => {
            limit: (n: number) => Promise<unknown[]>
          }
        }
      }
    })
      .select({ id: cols.id })
      .from(table)
      .where(cond)
      .limit(1)
    return rows.length > 0
  } catch {
    return false
  }
}

/**
 * 仅首次初始化种入：已标记 initDB:模块名 / initMenu:模块名 的路径整文件跳过
 *（不读 json 内容、不按表数据判断）。启动时一次拉齐标记到内存。
 * 重种需清 base_conf 对应键（或 lock）后重启。
 * i18n 语种种子：无 upload 插件则跳过且不打标记，下次装好插件后再种。
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
      if (name === 'i18n') {
        const canFlag = await hasEnabledUploadPlugin(options.db, options.schema)
        if (!canFlag) {
          console.error(
            '[init] 跳过语种种子：请先安装并启用存储桶（upload）插件',
          )
          continue
        }
      }
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
