import { createHash, randomUUID } from 'node:crypto'
import { CommException, Inject, Provide } from '/#/server'
import { PluginInfoService } from '../../base/service/plugin'

type WxAccount = {
  getAppId: () => string
  getSecret: () => string
}

type WxAppLike = {
  getAccount: () => WxAccount
  getAccessToken?: () => { getToken: () => Promise<string> }
  getUtils?: () => {
    codeToSession: (code: string) => Promise<Record<string, unknown>>
    decryptSession: (
      sessionKey: string,
      iv: string,
      encryptedData: string,
    ) => Promise<Record<string, unknown>>
  }
}

type WxPlugin = {
  MiniApp: () => Promise<WxAppLike>
  OfficialAccount: () => Promise<WxAppLike>
  OpenPlatform: () => Promise<WxAppLike>
}

@Provide()
export class UserWxService {
  @Inject()
  plugin: PluginInfoService

  private async getPlugin() {
    try {
      return (await this.plugin.getInstance('wx')) as WxPlugin
    } catch {
      throw new CommException('未配置微信插件，请安装 wx')
    }
  }

  async getMiniApp() {
    return (await this.getPlugin()).MiniApp()
  }

  async getOfficialAccount() {
    return (await this.getPlugin()).OfficialAccount()
  }

  async getOpenPlatform() {
    return (await this.getPlugin()).OpenPlatform()
  }

  /** 公众号 JS-SDK 签名配置 */
  async getWxMpConfig(url: string) {
    const token = await this.getWxToken('mp')
    const ticketRes = await fetch(
      `https://api.weixin.qq.com/cgi-bin/ticket/getticket?access_token=${token}&type=jsapi`,
    )
    const ticketJson = (await ticketRes.json()) as { ticket?: string }
    if (!ticketJson.ticket) throw new CommException('获取 jsapi_ticket 失败')

    const account = (await this.getOfficialAccount()).getAccount()
    const result = {
      timestamp: Math.floor(Date.now() / 1000),
      nonceStr: randomUUID().replace(/-/g, ''),
      appId: account.getAppId(),
      signature: '',
    }
    const raw = [
      `jsapi_ticket=${ticketJson.ticket}`,
      `noncestr=${result.nonceStr}`,
      `timestamp=${result.timestamp}`,
      `url=${decodeURI(url)}`,
    ].join('&')
    result.signature = createHash('sha1').update(raw).digest('hex').toUpperCase()
    return result
  }

  async getWxToken(type: 'mp' | 'open' = 'mp') {
    const app =
      type === 'mp' ? await this.getOfficialAccount() : await this.getOpenPlatform()
    if (!app.getAccessToken) throw new CommException('微信 access_token 不可用')
    return app.getAccessToken().getToken()
  }

  async mpUserInfo(code: string) {
    const token = await this.openOrMpToken(code, 'mp')
    return this.openOrMpUserInfo(token)
  }

  async appUserInfo(code: string) {
    const token = await this.openOrMpToken(code, 'open')
    return this.openOrMpUserInfo(token)
  }

  async openOrMpUserInfo(token: { access_token: string; openid: string }) {
    const res = await fetch(
      `https://api.weixin.qq.com/sns/userinfo?access_token=${token.access_token}&openid=${token.openid}&lang=zh_CN`,
    )
    return (await res.json()) as Record<string, unknown>
  }

  async openOrMpToken(code: string, type: 'mp' | 'open' = 'mp') {
    const account =
      type === 'mp'
        ? (await this.getOfficialAccount()).getAccount()
        : (await this.getMiniApp()).getAccount()
    const res = await fetch(
      'https://api.weixin.qq.com/sns/oauth2/access_token?' +
        new URLSearchParams({
          appid: account.getAppId(),
          secret: account.getSecret(),
          code,
          grant_type: 'authorization_code',
        }),
    )
    return (await res.json()) as {
      access_token: string
      openid: string
      errcode?: number
      errmsg?: string
    }
  }

  async miniSession(code: string) {
    const app = await this.getMiniApp()
    const utils = app.getUtils?.()
    if (!utils?.codeToSession) throw new CommException('小程序 SDK 不可用')
    return utils.codeToSession(code)
  }

  async miniUserInfo(code: string, encryptedData: string, iv: string) {
    const session = await this.miniSession(code)
    if (session.errcode) throw new CommException('登录失败，请重试')
    const info = await this.miniDecryptData(
      encryptedData,
      iv,
      String(session.session_key || ''),
    )
    if (!info) return null
    const { watermark: _w, ...rest } = info
    return {
      ...rest,
      openid: session.openid,
      unionid: session.unionid,
    }
  }

  async miniPhone(code: string, encryptedData: string, iv: string) {
    const session = await this.miniSession(code)
    if (session.errcode) throw new CommException('获取手机号失败，请刷新重试')
    const result = await this.miniDecryptData(
      encryptedData,
      iv,
      String(session.session_key || ''),
    )
    return String(result.phoneNumber || '')
  }

  async miniDecryptData(encryptedData: string, iv: string, sessionKey: string) {
    const app = await this.getMiniApp()
    const utils = app.getUtils?.()
    if (!utils?.decryptSession) throw new CommException('小程序解密不可用')
    return utils.decryptSession(sessionKey, iv, encryptedData)
  }
}
