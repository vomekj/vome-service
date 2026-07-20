import { and, eq, isNull } from 'drizzle-orm'
import {
  CommException,
  Inject,
  InjectRepository,
  Provide,
  type Repository,
} from '/#/server'
import { BaseService } from '/#/server'
import { TokenService } from '../../../lib/auth/token'
import { CacheStore } from '../../../lib/cache'
import { PluginInfoService } from '../../base/service/plugin'
import { userInfo } from '../entity/info'
import { UserEmailService } from './email'
import { UserSmsService } from './sms'
import { UserWxService } from './wx'

function isEmail(addr: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)
}

function isPhone(addr: string) {
  return /^1\d{10}$/.test(addr)
}

function isPlaceholderEmail(addr: string) {
  return /@(phone|wx)\.invalid$/i.test(addr)
}

type UploadPlugin = {
  downAndUpload?: (url: string, fileName?: string) => Promise<string>
}

function md5(text: string) {
  return new Bun.CryptoHasher('md5').update(text).digest('hex')
}

function bearerToken(headers?: Headers) {
  const value = headers?.get('authorization')
  if (!value?.toLowerCase().startsWith('bearer ')) return null
  return value.slice(7).trim()
}

@Provide()
export class UserPersonService extends BaseService {
  @InjectRepository(userInfo)
  infoRepo: Repository<typeof userInfo>
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

  private readonly refreshKeyPrefix = 'web:refresh:'

  private refreshKey(tokenHash: string) {
    return `${this.refreshKeyPrefix}${tokenHash}`
  }

  async person(userId: string) {
    const where = and(eq(userInfo.id, userId), isNull(userInfo.deletedAt))
    if (!where) throw new CommException('查询条件无效')
    const info = await this.infoRepo.findOne(where)
    if (!info) throw new CommException('用户不存在')
    const { password: _p, ...rest } = info
    return rest
  }

  async updatePerson(userId: string, body: Record<string, unknown>) {
    const info = await this.person(userId)
    const payload: Record<string, unknown> = {}
    if (body.name != null) payload.name = String(body.name)
    if (body.image != null) {
      let image = String(body.image)
      if (image && image !== info.image) {
        try {
          const file = (await this.plugin.getInstance('upload')) as UploadPlugin
          if (file.downAndUpload && image.startsWith('http')) {
            image = await file.downAndUpload(image, `${crypto.randomUUID()}.png`)
          }
        } catch {
          // 保留原 URL
        }
      }
      payload.image = image
    }
    if (!Object.keys(payload).length) return info
    await this.infoRepo.update(eq(userInfo.id, userId), payload)
    return this.person(userId)
  }

  async updatePassword(userId: string, password: string, code: string) {
    const user = await this.infoRepo.findById(userId)
    if (!user?.phone) throw new CommException('请先绑定手机号')
    const ok = await this.sms.checkCode(user.phone, code)
    if (!ok) throw new CommException('验证码错误')
    await this.infoRepo.update(eq(userInfo.id, userId), {
      password: md5(password),
    })
  }

  async logoff(userId: string) {
    await this.infoRepo.update(eq(userInfo.id, userId), {
      status: 2,
      phone: null,
      unionid: null,
      image: null,
      name: `已注销-00${userId.slice(0, 8)}`,
    })
  }

  async bindPhone(userId: string, phone: string, code: string) {
    const raw = phone.trim()
    if (!isPhone(raw)) throw new CommException('手机号格式不正确')

    const user = await this.infoRepo.findById(userId)
    if (!user || user.deletedAt) throw new CommException('用户不存在')

    // 已验证且手机号未变：无需再验
    if (user.phoneVerified && user.phone === raw) {
      return
    }

    const ok = await this.sms.checkCode(raw, code)
    if (!ok) throw new CommException('验证码错误')

    const existsWhere = and(eq(userInfo.phone, raw), isNull(userInfo.deletedAt))
    if (!existsWhere) throw new CommException('查询条件无效')
    const exists = await this.infoRepo.findOne(existsWhere)
    if (exists && exists.id !== userId) throw new CommException('手机号已被占用')

    await this.infoRepo.update(eq(userInfo.id, userId), {
      phone: raw,
      phoneVerified: true,
    })
  }

  /**
   * 绑定 / 验证邮箱（邮箱验证码）。
   * 已验证且邮箱未变则直接成功，不重复校验验证码。
   */
  async bindEmail(userId: string, email: string, code: string) {
    const addr = email.trim().toLowerCase()
    if (!isEmail(addr)) throw new CommException('邮箱格式不正确')
    if (isPlaceholderEmail(addr)) throw new CommException('请使用真实邮箱')

    const user = await this.infoRepo.findById(userId)
    if (!user || user.deletedAt) throw new CommException('用户不存在')

    if (user.emailVerified && user.email?.toLowerCase() === addr) {
      return
    }

    const ok = await this.email.checkCode(addr, code)
    if (!ok) throw new CommException('验证码错误')

    const existsWhere = and(eq(userInfo.email, addr), isNull(userInfo.deletedAt))
    if (!existsWhere) throw new CommException('查询条件无效')
    const exists = await this.infoRepo.findOne(existsWhere)
    if (exists && exists.id !== userId) throw new CommException('邮箱已被占用')

    await this.infoRepo.update(eq(userInfo.id, userId), {
      email: addr,
      emailVerified: true,
    })
  }

  async miniPhone(
    userId: string,
    code: string,
    encryptedData: string,
    iv: string,
  ) {
    const phone = await this.wx.miniPhone(code, encryptedData, iv)
    if (!phone) throw new CommException('获得手机号失败')
    await this.infoRepo.update(eq(userInfo.id, userId), {
      phone,
      phoneVerified: true,
    })
    return phone
  }

  /** 退出：吊销 access + refresh */
  async logout(refreshToken: string, headers?: Headers) {
    const access = bearerToken(headers)
    if (access) await this.token.web.revoke(access)
    if (refreshToken) {
      await this.cache.del(this.refreshKey(this.token.hash(refreshToken)))
    }
  }
}
