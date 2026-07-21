import { bootstrapInstalledModules } from '/#/server'

/**
 * 业务模块生命周期：加载 + 席位同步/心跳均在 core
 */
export const Module = {
  async bootstrap() {
    await bootstrapInstalledModules()
  },
}
