import { ModuleRegistry } from '/#/server'

/**
 * 业务模块生命周期（IoC 就绪后由 core 调用）
 */
export const Module = {
  async bootstrap() {
    ModuleRegistry.bootstrap()
  },
}
