import {
  CommException,
  Inject,
  Provide,
  BaseService,
  installModuleFromZip,
  uninstallModuleFiles,
  pModulesPath,
  formatSeatDisplay,
  getModuleSeatStatus,
  assertModuleSeatActive,
  type ModuleInstalled,
  type ModuleManifest,
  type ModuleMenuDef,
} from '/#/server'
import { and, eq, isNull } from 'drizzle-orm'
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from 'node:fs'
import { join } from 'node:path'
import { baseMenu } from '../entity/menu'
import { MenuService } from './rbac'
import { PluginInfoService } from './plugin'

function marketInstallOpts() {
  // 公钥 / license 签发 / 席位均在 vome-core（docsUrl 派生）；宿主勿再配开关
  return {}
}

@Provide()
export class ModuleService extends BaseService {
  @Inject()
  menuService: MenuService
  @Inject()
  pluginInfo: PluginInfoService

  /**
   * 安装 .vome：整段验签/解压/加载在 core；
   * 宿主只负责钩子注册与菜单同步。
   */
  async install(filePath: string) {
    let installed
    try {
      installed = await installModuleFromZip(filePath, {
        ...marketInstallOpts(),
        beforeReplace: async (key, manifest) => {
          if (manifest.hook) {
            try {
              await this.pluginInfo.unregisterByKey(key)
            } catch {
              /* 首次安装无记录 */
            }
          }
        },
      })
    } catch (e) {
      throw new CommException(
        e instanceof Error ? e.message : '插件安装失败',
      )
    }

    const { manifest, hasHook } = installed
    try {
      if (hasHook) {
        await this.pluginInfo.registerFromModule(manifest)
      }
      if (manifest.menus?.length) {
        await this.syncMenus(manifest.key, manifest.menus)
      }
    } catch (e) {
      try {
        if (hasHook) await this.pluginInfo.unregisterByKey(manifest.key)
      } catch {
        /* ignore */
      }
      uninstallModuleFiles(manifest.key)
      throw new CommException(
        e instanceof Error ? e.message : '插件注册失败',
      )
    }

    return {
      type: 3 as const,
      message: '安装成功',
      data: {
        ...manifest,
        path: installed.path,
        hasServer: installed.hasServer,
        hasWeb: installed.hasWeb,
        hasHook: installed.hasHook,
        entryUrl: installed.entryUrl,
      },
    }
  }

  async list(): Promise<ModuleInstalled[]> {
    const root = pModulesPath()
    if (!existsSync(root)) return []
    const out: ModuleInstalled[] = []
    for (const name of readdirSync(root)) {
      const dir = join(root, name)
      if (!statSync(dir).isDirectory()) continue
      const metaPath = join(dir, 'module.json')
      if (!existsSync(metaPath)) continue
      try {
        const manifest = JSON.parse(
          readFileSync(metaPath, 'utf8'),
        ) as ModuleManifest
        out.push({
          ...manifest,
          path: dir,
          hasServer: existsSync(join(dir, 'server', 'index.js')),
          hasWeb: existsSync(join(dir, 'web', 'index.html')),
          hasHook: Boolean(manifest.hook),
          seat: formatSeatDisplay(getModuleSeatStatus(name)),
        })
      } catch {
        /* skip */
      }
    }
    return out
  }

  async remove(key: string) {
    if (!key || !/^[a-zA-Z0-9_-]+$/.test(key)) {
      throw new CommException('key 非法')
    }
    const root = pModulesPath()
    const target = join(root, key)
    if (!existsSync(target)) throw new CommException('模块不存在')

    let manifest: ModuleManifest | undefined
    try {
      manifest = JSON.parse(
        readFileSync(join(target, 'module.json'), 'utf8'),
      ) as ModuleManifest
    } catch {
      /* ignore */
    }

    if (manifest?.hook) {
      await this.pluginInfo.unregisterByKey(key)
    }
    try {
      uninstallModuleFiles(key)
    } catch (e) {
      throw new CommException(e instanceof Error ? e.message : '卸载失败')
    }
    await this.removeMenusByAppKey(key)
    return { ok: true }
  }

  /** 按 appKey / perms 幂等写入菜单 */
  private async syncMenus(moduleKey: string, menus: ModuleMenuDef[]) {
    for (const item of menus) {
      const appKey = item.appKey || moduleKey
      const perms = item.perms
      const existing = perms
        ? await this.menuService.menuRepo.findOne(
            and(eq(baseMenu.perms, perms), isNull(baseMenu.deletedAt))!,
          )
        : await this.menuService.menuRepo.findOne(
            and(eq(baseMenu.appKey, appKey), isNull(baseMenu.deletedAt))!,
          )

      const row = {
        name: item.name,
        router: item.router ?? null,
        perms: perms ?? null,
        type: item.type ?? 1,
        icon: item.icon ?? null,
        orderNum: item.orderNum ?? 0,
        appKey,
        isShow: item.isShow ?? true,
        keepAlive: true,
      }

      if (existing) {
        await this.menuService.menuRepo.save({ ...existing, ...row })
      } else {
        await this.menuService.menuRepo.save(row)
      }
    }
  }

  private async removeMenusByAppKey(appKey: string) {
    await this.menuService.menuRepo.softDelete(
      and(eq(baseMenu.appKey, appKey), isNull(baseMenu.deletedAt))!,
    )
  }
}
