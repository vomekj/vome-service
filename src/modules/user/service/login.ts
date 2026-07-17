import { and, eq, isNull } from 'drizzle-orm'
import {
  CommException,
  Inject,
  InjectRepository,
  Provide,
  isTenantEnabled,
  type Repository,
} from '/#/server'
import { BaseService } from '/#/server'
import { AuthExpires } from '../../../lib/auth/config'
import { JwtService } from '../../../lib/auth/jwt'
import { TokenService } from '../../../lib/auth/token'
import { CacheStore } from '../../../lib/cache'
import { createCaptchaImage } from '../../../lib/captcha'
import { TenantService } from '../../base/service/tenant'
import { PluginInfoService } from '../../base/service/plugin'
import { userInfo } from '../entity/info'
import { userWx } from '../entity/wx'
import { UserEmailService } from './email'
import { UserSmsService } from './sms'
import { UserWxService } from './wx'

type UploadPlugin = {
  downAndUpload?: (url: string, fileName?: string) => Promise<string>
}

function md5(text: string) {
  return new Bun.CryptoHasher('md5').update(text).digest('hex')
}

function maskPhone(phone: string) {
  return phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2')
}

function maskEmail(email: string) {
  const [name, domain] = email.split('@')
  if (!name || !domain) return email
  const head = name.slice(0, Math.min(2, name.length))
  return `${head}***@${domain}`
}

function isEmail(account: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account)
}

function isPhone(account: string) {
  return /^1\d{10}$/.test(account)
}

function normalizeAccount(account: string) {
  return account.trim()
}

function oneRow<T>(row: T | T[]): T {
  return Array.isArray(row) ? row[0]! : row
}

function mustWhere(w: ReturnType<typeof and>) {
  if (!w) throw new CommException('查询条件无效')
  return w
}

@Provide()
export class UserLoginService extends BaseService {
  @InjectRepository(userInfo)
  infoRepo: Repository<typeof userInfo>
  @InjectRepository(userWx)
  wxRepo: Repository<typeof userWx>
  @Inject()
  sms: UserSmsService
  @Inject()
  email: UserEmailService
  @Inject()
  wx: UserWxService
  @Inject()
  plugin: PluginInfoService
  @Inject()
  cache: CacheStore
  @Inject()
  token: TokenService
  @Inject()
  jwt: JwtService
  @Inject()
  tenant: TenantService

  private readonly captchaKeyPrefix = 'verify:img:'
  private readonly captchaTtlMs = 5 * 60 * 1000
  private readonly refreshKeyPrefix = 'web:refresh:'

  private captchaKey(captchaId: string) {
    return `${this.captchaKeyPrefix}${captchaId}`
  }

  private refreshKey(tokenHash: string) {
    return `${this.refreshKeyPrefix}${tokenHash}`
  }

  async captcha(width = 150, height = 50, color = '#333333') {
    const image = createCaptchaImage({ width, height, color })
    await this.cache.set(
      this.captchaKey(image.captchaId),
      image.answer,
      this.captchaTtlMs,
    )
    return { captchaId: image.captchaId, data: image.data }
  }

  async captchaCheck(captchaId: string, value: string) {
    if (!captchaId || !value) return false
    const key = this.captchaKey(captchaId)
    const cached = await this.cache.get(key)
    await this.cache.del(key)
    if (!cached) return false
    return value.toLowerCase() === cached.toLowerCase()
  }

  /** 发短信（先过图片验证码） */
  async smsCode(phone: string, captchaId: string, code: string) {
    if (!isPhone(phone)) throw new CommException('手机号格式不正确')
    const ok = await this.captchaCheck(captchaId, code)
    if (!ok) throw new CommException('图片验证码错误')
    await this.sms.sendSms(phone)
  }

  /** 发邮箱验证码（先过图片验证码） */
  async emailCode(email: string, captchaId: string, code: string) {
    const addr = email.trim().toLowerCase()
    if (!isEmail(addr)) throw new CommException('邮箱格式不正确')
    const ok = await this.captchaCheck(captchaId, code)
    if (!ok) throw new CommException('图片验证码错误')
    await this.email.sendCode(addr)
  }

  async phoneVerifyCode(phone: string, smsCode: string) {
    if (!isPhone(phone)) throw new CommException('手机号格式不正确')
    const ok = await this.sms.checkCode(phone, smsCode)
    if (!ok) throw new CommException('验证码错误')
    return this.phone(phone)
  }

  async emailVerifyCode(email: string, emailCode: string) {
    const addr = email.trim().toLowerCase()
    if (!isEmail(addr)) throw new CommException('邮箱格式不正确')
    const ok = await this.email.checkCode(addr, emailCode)
    if (!ok) throw new CommException('验证码错误')
    return this.emailLogin(addr)
  }

  /**
   * 发送登录验证码：后端按账号格式分流
   * 手机号 → 短信；邮箱 → 邮件
   */
  async otpCode(account: string, captchaId: string, code: string) {
    const raw = normalizeAccount(account)
    if (isPhone(raw)) return this.smsCode(raw, captchaId, code)
    if (isEmail(raw)) return this.emailCode(raw, captchaId, code)
    throw new CommException('请输入正确的手机号或邮箱')
  }

  /**
   * 验证码登录（登录即注册）：后端按账号格式分流
   * 手机号 → 手机登录即注册；邮箱 → 邮箱登录即注册
   */
  async otpLogin(account: string, code: string) {
    const raw = normalizeAccount(account)
    if (isPhone(raw)) return this.phoneVerifyCode(raw, code)
    if (isEmail(raw)) return this.emailVerifyCode(raw, code)
    throw new CommException('请输入正确的手机号或邮箱')
  }

  async miniPhone(code: string, encryptedData: string, iv: string) {
    const phone = await this.wx.miniPhone(code, encryptedData, iv)
    if (!phone) throw new CommException('获得手机号失败，请检查配置')
    return this.phone(phone)
  }

  async uniPhone(access_token: string, openid: string, appId: string) {
    try {
      const instance = (await this.plugin.getInstance('uniphone')) as {
        getPhone: (
          accessToken: string,
          openid: string,
          appId: string,
        ) => Promise<string>
      }
      const phone = await instance.getPhone(access_token, openid, appId)
      if (!phone) throw new CommException('获得手机号失败，请检查配置')
      return this.phone(phone)
    } catch (e) {
      if (e instanceof CommException) throw e
      throw new CommException('未配置 uniphone 插件')
    }
  }

  /** 手机号登录 / 自动注册 */
  async phone(phone: string) {
    let user = await this.infoRepo.findOne(
      mustWhere(and(eq(userInfo.phone, phone), isNull(userInfo.deletedAt))),
    )
    if (!user) {
      const tenantId = isTenantEnabled()
        ? await this.tenant.resolveTenantIdFromRequest()
        : undefined
      const id = crypto.randomUUID()
      user = oneRow(
        await this.infoRepo.create({
          id,
          phone,
          unionid: phone,
          name: maskPhone(phone),
          email: `${phone}@phone.invalid`,
          emailVerified: false,
          status: 1,
          tenantId: tenantId ?? null,
        }),
      )
    }
    this.assertActive(user)
    return this.issueTokens(user.id, user.tenantId)
  }

  /** 邮箱登录 / 自动注册 */
  async emailLogin(email: string) {
    let user = await this.infoRepo.findOne(
      mustWhere(and(eq(userInfo.email, email), isNull(userInfo.deletedAt))),
    )
    if (!user) {
      const tenantId = isTenantEnabled()
        ? await this.tenant.resolveTenantIdFromRequest()
        : undefined
      const id = crypto.randomUUID()
      user = oneRow(
        await this.infoRepo.create({
          id,
          email,
          emailVerified: true,
          unionid: email,
          name: maskEmail(email),
          status: 1,
          tenantId: tenantId ?? null,
        }),
      )
    }
    this.assertActive(user)
    return this.issueTokens(user.id, user.tenantId)
  }

  async mp(code: string) {
    const raw = await this.wx.mpUserInfo(code)
    if (!raw?.openid) throw new CommException('微信登录失败')
    const wxUser = await this.saveWxInfo(
      {
        openid: String(raw.openid),
        unionid: raw.unionid ? String(raw.unionid) : null,
        avatarUrl: raw.headimgurl ? String(raw.headimgurl) : null,
        nickName: raw.nickname ? String(raw.nickname) : null,
        gender: Number(raw.sex ?? 0),
        city: raw.city ? String(raw.city) : null,
        province: raw.province ? String(raw.province) : null,
        country: raw.country ? String(raw.country) : null,
      },
      1,
    )
    return this.wxLoginToken(wxUser)
  }

  async wxApp(code: string) {
    const raw = await this.wx.appUserInfo(code)
    if (!raw?.openid) throw new CommException('微信登录失败')
    const wxUser = await this.saveWxInfo(
      {
        openid: String(raw.openid),
        unionid: raw.unionid ? String(raw.unionid) : null,
        avatarUrl: raw.headimgurl ? String(raw.headimgurl) : null,
        nickName: raw.nickname ? String(raw.nickname) : null,
        gender: Number(raw.sex ?? 0),
        city: raw.city ? String(raw.city) : null,
        province: raw.province ? String(raw.province) : null,
        country: raw.country ? String(raw.country) : null,
      },
      3,
    )
    return this.wxLoginToken(wxUser)
  }

  async mini(code: string, encryptedData: string, iv: string) {
    const info = (await this.wx.miniUserInfo(code, encryptedData, iv)) as Record<
      string,
      unknown
    > | null
    if (!info?.openid) throw new CommException('微信登录失败')
    const wxUser = await this.saveWxInfo(
      {
        openid: String(info.openid),
        unionid: info.unionid ? String(info.unionid) : null,
        avatarUrl: info.avatarUrl ? String(info.avatarUrl) : null,
        nickName: info.nickName ? String(info.nickName) : null,
        gender: Number(info.gender ?? 0),
        city: info.city ? String(info.city) : null,
        province: info.province ? String(info.province) : null,
        country: info.country ? String(info.country) : null,
        language: info.language ? String(info.language) : null,
      },
      0,
    )
    return this.wxLoginToken(wxUser)
  }

  async saveWxInfo(
    data: {
      openid: string
      unionid?: string | null
      avatarUrl?: string | null
      nickName?: string | null
      gender?: number
      language?: string | null
      city?: string | null
      province?: string | null
      country?: string | null
    },
    type: number,
  ) {
    const existing = await this.wxRepo.findOne(eq(userWx.openid, data.openid))
    if (existing) {
      await this.wxRepo.update(eq(userWx.id, existing.id), {
        ...data,
        type,
      })
      return { ...existing, ...data, type }
    }
    return oneRow(await this.wxRepo.create({ ...data, type }))
  }

  async wxLoginToken(wxUser: {
    openid: string
    unionid?: string | null
    avatarUrl?: string | null
    nickName?: string | null
    type?: number
  }) {
    const unionid = wxUser.unionid || wxUser.openid
    let user = await this.infoRepo.findOne(
      mustWhere(and(eq(userInfo.unionid, unionid), isNull(userInfo.deletedAt))),
    )
    if (!user) {
      let image = wxUser.avatarUrl || null
      if (image) {
        try {
          const file = (await this.plugin.getInstance('upload')) as UploadPlugin
          if (file.downAndUpload) {
            image = await file.downAndUpload(image, `${crypto.randomUUID()}.png`)
          }
        } catch {
          // 无上传插件时保留原 URL
        }
      }
      const tenantId = isTenantEnabled()
        ? await this.tenant.resolveTenantIdFromRequest()
        : undefined
      const id = crypto.randomUUID()
      user = oneRow(
        await this.infoRepo.create({
          id,
          unionid,
          name: wxUser.nickName || '微信用户',
          image,
          email: `${unionid}@wx.invalid`,
          emailVerified: false,
          status: 1,
          tenantId: tenantId ?? null,
        }),
      )
    }
    this.assertActive(user)
    return this.issueTokens(user.id, user.tenantId)
  }

  async password(account: string, password: string) {
    const raw = normalizeAccount(account)
    const user = await this.findByAccount(raw)
    if (!user || !user.password || user.password !== md5(password)) {
      throw new CommException('账号或密码错误')
    }
    this.assertActive(user)
    return this.issueTokens(user.id, user.tenantId)
  }

  /** 密码注册（不自动登录即注册；成功后直接发 token） */
  async register(account: string, password: string) {
    const raw = normalizeAccount(account)
    if (!password || password.length < 6) {
      throw new CommException('密码至少 6 位')
    }
    const existing = await this.findByAccount(raw)
    if (existing) throw new CommException('账号已注册，请直接登录')

    const tenantId = isTenantEnabled()
      ? await this.tenant.resolveTenantIdFromRequest()
      : undefined
    const id = crypto.randomUUID()
    const hashed = md5(password)

    if (isPhone(raw)) {
      const user = oneRow(
        await this.infoRepo.create({
          id,
          phone: raw,
          unionid: raw,
          name: maskPhone(raw),
          email: `${raw}@phone.invalid`,
          emailVerified: false,
          password: hashed,
          status: 1,
          tenantId: tenantId ?? null,
        }),
      )
      return this.issueTokens(user.id, user.tenantId)
    }

    if (isEmail(raw)) {
      const email = raw.toLowerCase()
      const user = oneRow(
        await this.infoRepo.create({
          id,
          email,
          emailVerified: false,
          unionid: email,
          name: maskEmail(email),
          password: hashed,
          status: 1,
          tenantId: tenantId ?? null,
        }),
      )
      return this.issueTokens(user.id, user.tenantId)
    }

    throw new CommException('请输入正确的手机号或邮箱')
  }

  private async findByAccount(account: string) {
    if (isPhone(account)) {
      return this.infoRepo.findOne(
        mustWhere(and(eq(userInfo.phone, account), isNull(userInfo.deletedAt))),
      )
    }
    if (isEmail(account)) {
      const email = account.toLowerCase()
      return this.infoRepo.findOne(
        mustWhere(and(eq(userInfo.email, email), isNull(userInfo.deletedAt))),
      )
    }
    throw new CommException('请输入正确的手机号或邮箱')
  }

  async refreshToken(refreshToken: string) {
    const tokenHash = this.token.hash(refreshToken)
    const raw = await this.cache.get(this.refreshKey(tokenHash))
    if (!raw) throw new CommException('刷新token失败，请检查refreshToken是否正确或过期')
    let cached: { userId: string; tenantId?: number | null }
    try {
      cached = JSON.parse(raw) as { userId: string; tenantId?: number | null }
    } catch {
      throw new CommException('刷新token失败，请检查refreshToken是否正确或过期')
    }
    await this.cache.del(this.refreshKey(tokenHash))
    const user = await this.infoRepo.findById(cached.userId)
    if (!user || user.deletedAt) throw new CommException('用户不存在')
    this.assertActive(user)
    return this.issueTokens(user.id, user.tenantId)
  }

  private assertActive(user: { status?: number | null }) {
    if (user.status === 2) throw new CommException('账号已注销')
  }

  private async issueTokens(userId: string, tenantId?: number | null) {
    const accessToken = await this.jwt.web.sign(userId, {
      tenantId: tenantId ?? null,
    })
    await this.token.web.store(accessToken, {
      sub: userId,
      tenantId: tenantId ?? null,
    })

    const refreshToken = this.token.create()
    const tokenHash = this.token.hash(refreshToken)
    await this.cache.set(
      this.refreshKey(tokenHash),
      JSON.stringify({ userId, tenantId: tenantId ?? null }),
      AuthExpires.refresh.ms(),
    )

    return {
      expire: AuthExpires.access.seconds(),
      token: accessToken,
      refreshExpire: AuthExpires.refresh.seconds(),
      refreshToken,
    }
  }
}
