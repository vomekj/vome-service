import { Ioc } from '/#/server'
import { PluginCenterService } from '../../modules/base/service/plugin-center'

/**
 * 插件生命周期（IoC 就绪后由 core 调用）
 */
export const Plugin = {
  async bootstrap() {
    await Ioc.get(PluginCenterService).init()
  },
}
