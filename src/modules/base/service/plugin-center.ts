import { eq } from 'drizzle-orm'
import {
  getEnv,
  Ioc,
  Provide,
  loadPluginClass,
  type PluginInfo,
  InjectRepository,
  type Repository,
} from '/#/server'
import { decryptPluginConfig } from '../../../lib/plugin-config-crypto'
import { basePluginInfo } from '../entity/plugin-info'
import { PluginInfoService } from './plugin'

type PluginCtor = new () => {
  init: (
    info: PluginInfo,
    ctx?: unknown,
    app?: unknown,
    services?: Record<string, unknown>,
  ) => Promise<void>
}

/**
 * 插件中心（宿主）：无内置空壳，仅加载 DB 中启用的插件 / 钩子
 * 加载器在 vome-core（loadPluginClass）
 */
@Provide()
export class PluginCenterService {
  plugins = new Map<string, PluginCtor | object>()
  pluginInfos = new Map<string, PluginInfo>()

  @InjectRepository(basePluginInfo)
  pluginRepo: Repository<typeof basePluginInfo>

  private get pluginService() {
    return Ioc.get(PluginInfoService)
  }

  async init() {
    this.plugins.clear()
    this.pluginInfos.clear()
    await this.initPlugin()
    console.log(`[Plugin] ready ← ${this.plugins.size} slot(s)`)
  }

  async initOne(keyName: string) {
    await this.initPlugin({ keyName })
  }

  /** 卸掉槽位；钩子不再回落空壳，未安装即无实现 */
  async remove(keyName: string, _isHook = false) {
    this.plugins.delete(keyName)
    this.pluginInfos.delete(keyName)
  }

  async register(key: string, cls: PluginCtor, pluginInfo?: PluginInfo) {
    if (pluginInfo?.singleton) {
      const instance = new cls()
      await instance.init(this.pluginInfos.get(key) ?? pluginInfo, null, null, {
        pluginService: this.pluginService,
      })
      this.plugins.set(key, instance)
      return
    }
    this.plugins.set(key, cls)
  }

  async initPlugin(condition?: { keyName?: string; hook?: string; id?: number }) {
    let rows = await this.pluginRepo.find(eq(basePluginInfo.status, 1))
    if (condition?.keyName) {
      rows = rows.filter((r) => r.keyName === condition.keyName)
    }
    if (condition?.hook) {
      rows = rows.filter((r) => r.hook === condition.hook)
    }
    if (condition?.id != null) {
      rows = rows.filter((r) => r.id === condition.id)
    }

    for (const plugin of rows) {
      const data = await this.pluginService.getData(plugin.keyName)
      if (!data?.content?.data) continue

      const PluginClass = loadPluginClass(data.content.data)
      const decrypted = decryptPluginConfig(plugin.config)
      const pluginInfo: PluginInfo = {
        ...((plugin.pluginJson as PluginInfo) ?? {}),
        name: plugin.name,
        key: plugin.keyName,
        hook: plugin.hook ?? undefined,
        version: plugin.version,
        config: resolvePluginConfig(decrypted),
      }

      if (plugin.hook) {
        this.pluginInfos.set(plugin.hook, pluginInfo)
        await this.register(plugin.hook, PluginClass, pluginInfo)
      } else {
        this.pluginInfos.set(plugin.keyName, pluginInfo)
        await this.register(plugin.keyName, PluginClass, pluginInfo)
      }
    }
  }
}

function resolvePluginConfig(config: unknown): Record<string, unknown> {
  let cfg = config
  if (typeof cfg === 'string') {
    try {
      cfg = JSON.parse(cfg)
    } catch {
      return {}
    }
  }
  if (!cfg || typeof cfg !== 'object') return {}
  const obj = cfg as Record<string, unknown>
  const env = getEnv() === 'prod' ? 'prod' : 'local'
  let multi = false
  for (const key of Object.keys(obj)) {
    if (key.includes('@')) {
      multi = true
      break
    }
  }
  if (!multi) return obj
  const picked = obj[`@${env}`]
  return picked && typeof picked === 'object'
    ? (picked as Record<string, unknown>)
    : {}
}
