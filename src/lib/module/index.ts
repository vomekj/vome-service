import { bootstrapInstalledModules, Ioc } from '@core/server'
import { I18nLangService } from '../../modules/i18n/service/lang'

/**
 * 业务模块生命周期：加载 + 席位同步/心跳均在 core。
 * 插件已就绪后再补语种空国旗（种子入库不走 modifyBefore）。
 */
export const Module = {
  async bootstrap() {
    await bootstrapInstalledModules()
    void Ioc.get(I18nLangService)
      .ensureEmptyFlags()
      .catch((err) => {
        console.error('[i18n] ensureEmptyFlags failed', err)
      })
  },
}
