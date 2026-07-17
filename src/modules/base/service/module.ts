import {
  CommException,
  Inject,
  Provide,
  ModuleRegistry,
  pModulePath,
  pModulesPath,
  BaseService,
  type ModuleInstalled,
  type ModuleManifest,
  type ModuleMenuDef,
} from '/#/server'
import { and, eq, isNull } from 'drizzle-orm'
import AdmZip from 'adm-zip'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { baseMenu } from '../entity/menu'
import { MenuService } from './rbac'
import { PluginInfoService } from './plugin'

@Provide()
export class ModuleService extends BaseService {
  @Inject()
  menuService: MenuService
  @Inject()
  pluginInfo: PluginInfoService

  /** 安装 .vome：校验 module.json，写盘并热加载（接口 / 页面 / 钩子） */
  async install(filePath: string) {
    const zip = new AdmZip(filePath)
    const entry = zip.getEntry('module.json')
    if (!entry) throw new CommException('缺少 module.json')

    let manifest: ModuleManifest
    try {
      manifest = JSON.parse(entry.getData().toString('utf8')) as ModuleManifest
    } catch {
      throw new CommException('module.json 解析失败')
    }

    if (!manifest.key || !/^[a-zA-Z0-9_-]+$/.test(manifest.key)) {
      throw new CommException('module.json.key 非法')
    }
    if (!manifest.name || !manifest.version) {
      throw new CommException('module.json 需包含 name、key、version')
    }

    const names = zip.getEntries().map((e) => e.entryName.replace(/\\/g, '/'))
    const hasServer = names.includes('server/index.js')
    const hasWeb = names.some(
      (n) => n === 'web/index.html' || n.startsWith('web/'),
    )
    const hasHook = Boolean(manifest.hook)

    if (!hasServer && !hasWeb && !hasHook) {
      throw new CommException('至少需要 server/、web/ 或 hook')
    }
    if (hasHook && !hasServer) {
      throw new CommException('声明了 hook 必须包含 server/index.js（导出 Plugin）')
    }
    if ((manifest.routes?.length ?? 0) > 0 && !hasServer) {
      throw new CommException('声明了 routes 必须包含 server/index.js')
    }

    const target = pModulePath(manifest.key)
    const root = pModulesPath()
    if (!existsSync(root)) mkdirSync(root, { recursive: true })

    // 先卸旧实例再覆盖落盘
    ModuleRegistry.unload(manifest.key)
    if (hasHook) {
      try {
        await this.pluginInfo.unregisterByKey(manifest.key)
      } catch {
        /* 首次安装无记录 */
      }
    }
    if (existsSync(target)) rmSync(target, { recursive: true, force: true })
    mkdirSync(target, { recursive: true })
    zip.extractAllTo(target, true)
    writeFileSync(join(target, 'module.json'), JSON.stringify(manifest, null, 2))

    try {
      ModuleRegistry.load(manifest.key)
      if (hasHook) {
        await this.pluginInfo.registerFromModule(manifest)
      }
    } catch (e) {
      ModuleRegistry.unload(manifest.key)
      try {
        if (hasHook) await this.pluginInfo.unregisterByKey(manifest.key)
      } catch {
        /* ignore */
      }
      rmSync(target, { recursive: true, force: true })
      throw new CommException(
        e instanceof Error ? e.message : '模块加载失败',
      )
    }

    if (manifest.menus?.length) {
      await this.syncMenus(manifest.key, manifest.menus)
    }

    return {
      type: 3 as const,
      message: '安装成功',
      data: {
        ...manifest,
        path: target,
        hasServer,
        hasWeb,
        hasHook,
        entryUrl: hasWeb ? `/vome/apps/${manifest.key}/` : undefined,
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
    const target = pModulePath(key)
    if (!existsSync(target)) throw new CommException('模块不存在')

    let manifest: ModuleManifest | undefined
    try {
      manifest = JSON.parse(
        readFileSync(join(target, 'module.json'), 'utf8'),
      ) as ModuleManifest
    } catch {
      /* ignore */
    }

    ModuleRegistry.unload(key)
    if (manifest?.hook) {
      await this.pluginInfo.unregisterByKey(key)
    }
    rmSync(target, { recursive: true, force: true })
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
