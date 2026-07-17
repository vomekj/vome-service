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
import { UserSmsService } from './sms'
import { UserWxService } from './wx'

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
    const ok = await this.sms.checkCode(phone, code)
    if (!ok) throw new CommException('验证码错误')
    await this.infoRepo.update(eq(userInfo.id, userId), { phone })
  }

  async miniPhone(
    userId: string,
    code: string,
    encryptedData: string,
    iv: string,
  ) {
    const phone = await this.wx.miniPhone(code, encryptedData, iv)
    if (!phone) throw new CommException('获得手机号失败')
    await this.infoRepo.update(eq(userInfo.id, userId), { phone })
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
