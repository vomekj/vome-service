import { CommException, Inject, Provide } from '/#/server'
import { CacheStore } from '../../../lib/cache'
import { PluginInfoService } from '../../base/service/plugin'

type EmailPlugin = {
  send: (options: {
    from: string
    to: string
    subject: string
    text: string
    html?: string
  }) => Promise<unknown>
}

const EMAIL_TTL_MS = 180_000

@Provide()
export class UserEmailService {
  @Inject()
  cache: CacheStore
  @Inject()
  plugin: PluginInfoService

  private cacheKey(email: string) {
    return `email-code:${email.toLowerCase()}`
  }

  /** 发送 4 位邮箱验证码 */
  async sendCode(email: string) {
    const code = String(Math.floor(1000 + Math.random() * 9000))
    try {
      const inst = (await this.plugin.getInstance('email')) as EmailPlugin
      if (!inst || typeof inst.send !== 'function') {
        throw new CommException('未配置邮件插件，请安装并启用 email')
      }
      const cfg = (await this.plugin.getConfig('email')) as
        | { auth?: { user?: string } }
        | undefined
      const from = cfg?.auth?.user
      if (!from) throw new CommException('邮件插件未配置发件邮箱')
      await inst.send({
        from,
        to: email,
        subject: '登录验证码',
        text: `您的验证码是 ${code}，3 分钟内有效。`,
        html: `<p>您的验证码是 <b>${code}</b>，3 分钟内有效。</p>`,
      })
      await this.cache.set(this.cacheKey(email), code, EMAIL_TTL_MS)
    } catch (e) {
      if (e instanceof CommException) throw e
      throw new CommException('发送过于频繁，请稍后再试')
    }
  }

  /** 校验邮箱验证码（通过后消费） */
  async checkCode(email: string, code: string) {
    if (!email || !code) return false
    const key = this.cacheKey(email)
    const cached = await this.cache.get(key)
    if (!cached || cached !== code) return false
    await this.cache.del(key)
    return true
  }
}
