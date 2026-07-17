import 'reflect-metadata'
import { Ioc, vome } from '/#/server'
import { LogService } from './modules/base/service/log'

vome(({ App }) => {
  // App.bootstrap(async () => {})
  // 进程退出前强制刷出请求日志缓冲
  App.shutdown(async () => {
    try {
      await Ioc.get(LogService).flush()
    } catch (err) {
      console.error('[RequestLog] shutdown flush failed', err)
    }
  })
  // App.use((app) => app.use())
})
