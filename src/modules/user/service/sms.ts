import { CommException, Inject, Provide } from '/#/server'
import { CacheStore } from '../../../lib/cache'
import { PluginInfoService } from '../../base/service/plugin'

/**
 * 短信插件 send 约定：
 * - sms-ali：send(phones, { code })      阿里模板变量是命名对象
 * - sms-tx ：send(phones, [code])        腾讯模板变量是按顺序的数组
 */
type SmsPlugin = {
  send: (phone: string[], params: Record<string, unknown> | string[]) => Promise<unknown>
}

const SMS_TTL_MS = 180_000
/** 先腾讯后阿里；装哪个用哪个 */
const SMS_KEYS = ['sms-tx', 'sms-ali'] as const

@Provide()
export class UserSmsService {
  @Inject()
  cache: CacheStore
  @Inject()
  plugin: PluginInfoService

  private pluginKey: (typeof SMS_KEYS)[number] | null = null
  private sms: SmsPlugin | null = null

  private cacheKey(phone: string) {
    return `sms:${phone}`
  }

  private async ensurePlugin() {
    if (this.sms) return
    for (const key of SMS_KEYS) {
      try {
        const inst = (await this.plugin.getInstance(key)) as SmsPlugin
        if (inst && typeof inst.send === 'function') {
          this.sms = inst
          this.pluginKey = key
          return
        }
      } catch {
        continue
      }
    }
    throw new CommException('未配置短信插件，请安装 sms-tx 或 sms-ali')
  }

  /** 发送 4 位短信验证码 */
  async sendSms(phone: string) {
    await this.ensurePlugin()
    const code = String(Math.floor(1000 + Math.random() * 9000))
    try {
      // 腾讯按模板顺序传数组；阿里传 { 变量名: 值 }
      const params = this.pluginKey === 'sms-tx' ? [code] : { code }
      await this.sms!.send([phone], params)
      await this.cache.set(this.cacheKey(phone), code, SMS_TTL_MS)
    } catch (e) {
      if (e instanceof CommException) throw e
      throw new CommException('发送过于频繁，请稍后再试')
    }
  }

  /** 校验短信验证码（通过后消费） */
  async checkCode(phone: string, code: string) {
    if (!phone || !code) return false
    const key = this.cacheKey(phone)
    const cached = await this.cache.get(key)
    if (!cached || cached !== code) return false
    await this.cache.del(key)
    return true
  }
}
