import './config/provide'
import 'reflect-metadata'
import './lib/host'
import { Ioc, vome } from '@core/server'
import { cors } from './middleware/cors'
import { LogService } from './modules/base/service/log'
import { I18nDataService } from './modules/i18n/service/data'

vome(({ App }) => {
  App.use((app) => app.use(cors))
  App.bootstrap(async () => {
    Ioc.get(I18nDataService)
  })
  // 进程退出前强制刷出请求日志缓冲
  App.shutdown(async () => {
    try {
      await Ioc.get(LogService).flush()
    } catch (err) {
      console.error('[RequestLog] shutdown flush failed', err)
    }
  })
})
