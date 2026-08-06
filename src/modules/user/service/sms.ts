import { CommException, Inject, Provide } from '@core/server'
import { CacheStore } from '../../../lib/cache'
import { PluginInfoService } from '../../base/service/plugin'

/**
 * 对齐 cool-admin `UserSmsService`：
 * - 优先 sms-tx，其次 sms-ali
 * - tx: send([phone], [code])；ali: send([phone], { code })
 *
 * 额外处理：阿里云偶发「短信已发出但 SDK 抛 ReadTimeout / OK」，按成功落缓存，避免前端误报。
 */
type SmsPlugin = {
  send: (
    phones: string[],
    params: Record<string, unknown> | string[],
  ) => Promise<unknown>
}

const SMS_TTL_MS = 180_000
const SMS_KEYS = ['sms-tx', 'sms-ali'] as const

function errText(e: unknown) {
  if (e == null) return ''
  if (typeof e === 'string') return e
  if (e instanceof Error) return e.message || String(e)
  try {
    return JSON.stringify(e)
  } catch {
    return String(e)
  }
}

/** 短信通道侧已成功，但 HTTP/SDK 仍抛错 */
function isSmsDeliveredError(e: unknown) {
  const text = errText(e)
  const code = String(
    (e as { code?: string; Code?: string })?.code ??
      (e as { Code?: string })?.Code ??
      '',
  )
  if (code === 'OK') return true
  if (/^OK\b/i.test(text.trim())) return true
  // 阿里云 pop-core：请求已到服务端，读响应超时；业务上短信通常已发出
  if (/ReadTimeout|ETIMEDOUT|ESOCKETTIMEDOUT|Timeout/i.test(text)) return true
  if (/POST\s+\/\s+failed/i.test(text)) return true
  return false
}

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
  }

  /** 发送 4 位短信验证码（cool-admin 同款流程） */
  async sendSms(phone: string) {
    await this.ensurePlugin()
    if (!this.sms || !this.pluginKey) {
      throw new CommException(
        '未配置短信插件，请安装并启用 sms-tx 或 sms-ali',
      )
    }

    const code = String(Math.floor(1000 + Math.random() * 9000))
    const key = this.cacheKey(phone)

    try {
      if (this.pluginKey === 'sms-tx') {
        await this.sms.send([phone], [code])
      } else {
        await this.sms.send([phone], { code })
      }
      await this.cache.set(key, code, SMS_TTL_MS)
    } catch (error) {
      // 已发出（ReadTimeout / OK 误抛）：照常缓存，接口成功
      if (isSmsDeliveredError(error)) {
        await this.cache.set(key, code, SMS_TTL_MS)
        return
      }
      // 其余失败统一提示（多为限流/通道拒绝）
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
