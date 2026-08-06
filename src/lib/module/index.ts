import { bootstrapInstalledModules } from '@core/server'

/**
 * 业务模块生命周期：加载 + 席位同步/心跳均在 core
 */
export const Module = {
  async bootstrap() {
    await bootstrapInstalledModules()
  },
}
