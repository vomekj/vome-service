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
} from '@core/server'
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

    const { manifest } = installed
    try {
      // 钩子 / 纯前端 / 全栈都写入已安装列表（纯前端此前只写菜单，卡片缺失）
      await this.pluginInfo.registerFromModule(manifest)
      if (manifest.menus?.length) {
        await this.syncMenus(manifest.key, manifest.menus)
      }
    } catch (e) {
      try {
        await this.pluginInfo.unregisterByKey(manifest.key)
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

    try {
      await this.pluginInfo.unregisterByKey(key)
    } catch {
      /* 未登记过插件表也可卸载落盘 */
    }
    try {
      uninstallModuleFiles(key)
    } catch (e) {
      throw new CommException(e instanceof Error ? e.message : '卸载失败')
    }
    await this.removeMenusByAppKey(key)
    return { ok: true }
  }

  /**
   * 微应用页面统一挂在「无界渲染」下（幂等：router=/wujie type=0）
   */
  private async ensureWujieParent(): Promise<number> {
    const router = '/wujie'
    const existing = await this.menuService.menuRepo.findOne(
      and(
        eq(baseMenu.router, router),
        eq(baseMenu.type, 0),
        isNull(baseMenu.deleteTime),
      )!,
    )
    const row = {
      name: '无界渲染',
      router,
      type: 0,
      icon: 'ri-artboard-fill',
      orderNum: 20,
      parentId: null as number | null,
      appKey: null as string | null,
      perms: null as string | null,
      isShow: true,
      keepAlive: true,
    }
    if (existing) {
      await this.menuService.menuRepo.save({ ...existing, ...row })
      return Number(existing.id)
    }
    const saved = (await this.menuService.menuRepo.save(row)) as {
      id: number
    }
    return Number(saved.id)
  }

  /** 按 appKey / perms 幂等写入菜单；微应用页挂到「无界渲染」、无 icon */
  private async syncMenus(moduleKey: string, menus: ModuleMenuDef[]) {
    let wujieParentId: number | null = null

    for (const item of menus) {
      const appKey = item.appKey || moduleKey
      const perms = item.perms
      const isMicroPage =
        Boolean(item.appKey) ||
        (item.type !== 0 && item.type !== 2 && Boolean(item.router))

      if (isMicroPage && wujieParentId == null) {
        wujieParentId = await this.ensureWujieParent()
      }

      const existing = perms
        ? await this.menuService.menuRepo.findOne(
            and(eq(baseMenu.perms, perms), isNull(baseMenu.deleteTime))!,
          )
        : await this.menuService.menuRepo.findOne(
            and(eq(baseMenu.appKey, appKey), isNull(baseMenu.deleteTime))!,
          )

      const row = {
        name: item.name,
        router: item.router ?? null,
        perms: perms ?? null,
        type: item.type ?? 1,
        // 微应用页面不设 icon；父「无界渲染」才带 ri-artboard-fill
        icon: isMicroPage ? null : (item.icon ?? null),
        orderNum: item.orderNum ?? 0,
        appKey: isMicroPage ? appKey : (item.appKey ?? null),
        parentId: isMicroPage ? wujieParentId : (existing?.parentId ?? null),
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
      and(eq(baseMenu.appKey, appKey), isNull(baseMenu.deleteTime))!,
    )
  }
}
