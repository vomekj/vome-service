import { eq } from 'drizzle-orm'
import { Inject, Provide, noTenant } from '/#/server'
import type {
  AdminAuthResult,
  AdminRefreshCache,
  AdminSession,
  AdminTokenPayload,
} from '../../../../typings/base/auth'
import { InjectRepository, type Repository } from '/#/server'
import { BaseService } from '/#/server'
import { AuthExpires } from '../../../lib/auth/config'
import { JwtService } from '../../../lib/auth/jwt'
import { TokenService } from '../../../lib/auth/token'
import { CacheStore } from '../../../lib/cache'
import { createCaptchaImage } from '../../../lib/captcha'
import { baseUser } from '../entity/user'

@Provide()
export class AdminAuthService extends BaseService {
  @InjectRepository(baseUser)
  baseUserEntity: Repository<typeof baseUser>
  @Inject()
  cache: CacheStore
  @Inject()
  token: TokenService
  @Inject()
  jwt: JwtService

  private readonly refreshKeyPrefix = 'admin:refresh:'
  private readonly captchaKeyPrefix = 'verify:img:'
  private readonly captchaTtlMs = 5 * 60 * 1000

  private refreshKey(tokenHash: string) {
    return `${this.refreshKeyPrefix}${tokenHash}`
  }

  private captchaKey(captchaId: string) {
    return `${this.captchaKeyPrefix}${captchaId}`
  }

  /** 混合四则运算图片验证码（答案仅缓存） */
  async captcha(width = 150, height = 50, color = '#333333') {
    const image = createCaptchaImage({ width, height, color })
    await this.cache.set(
      this.captchaKey(image.captchaId),
      image.answer,
      this.captchaTtlMs,
    )
    return { captchaId: image.captchaId, data: image.data }
  }

  /** 校验并消费验证码 */
  async captchaCheck(captchaId: string, value: string): Promise<boolean> {
    if (!captchaId || !value) return false
    const key = this.captchaKey(captchaId)
    const cached = await this.cache.get(key)
    await this.cache.del(key)
    if (!cached) return false
    return value.toLowerCase() === cached
  }

  private async issueTokens(
    userId: number,
    username: string,
    tenantId?: number | null,
  ): Promise<AdminTokenPayload> {
    const accessToken = await this.jwt.admin.sign(userId, {
      username,
      tenantId: tenantId ?? null,
    })
    await this.token.admin.store(accessToken, { sub: userId, username, tenantId })

    const refreshToken = this.token.create()
    const tokenHash = this.token.hash(refreshToken)

    await this.cache.set(
      this.refreshKey(tokenHash),
      JSON.stringify({ userId, username, tenantId: tenantId ?? null }),
      AuthExpires.refresh.ms(),
    )

    return {
      accessToken,
      refreshToken,
      expiresIn: AuthExpires.access.seconds(),
    }
  }

  async login(
    username: string,
    password: string,
    captchaId: string,
    verifyCode: string,
  ): Promise<AdminAuthResult> {
    const captchaOk = await this.captchaCheck(captchaId, verifyCode)
    if (!captchaOk) {
      return { error: 'invalid_captcha' }
    }

    const user = await noTenant(async () => {
      const [row] = await this.baseUserEntity.find(eq(baseUser.username, username))
      return row
    })

    if (!user || user.status !== 1) {
      return { error: 'invalid_credentials' }
    }

    const valid = await Bun.password.verify(password, user.password)
    if (!valid) {
      return { error: 'invalid_credentials' }
    }

    return {
      data: await this.issueTokens(user.id, user.username, user.tenantId),
    }
  }

  async refresh(refreshToken: string): Promise<AdminAuthResult> {
    const tokenHash = this.token.hash(refreshToken)
    const key = this.refreshKey(tokenHash)
    const raw = await this.cache.get(key)

    if (!raw) {
      return { error: 'invalid_refresh_token' }
    }

    let session: AdminRefreshCache
    try {
      session = JSON.parse(raw) as AdminRefreshCache
    } catch {
      await this.cache.del(key)
      return { error: 'invalid_refresh_token' }
    }

    const user = await noTenant(async () => {
      const [row] = await this.baseUserEntity.find(eq(baseUser.id, session.userId))
      return row
    })

    if (!user || user.status !== 1) {
      await this.cache.del(key)
      return { error: 'invalid_refresh_token' }
    }

    await this.cache.del(key)
    return {
      data: await this.issueTokens(user.id, user.username, user.tenantId),
    }
  }

  async logout(refreshToken: string, headers?: Headers): Promise<void> {
    await this.cache.del(this.refreshKey(this.token.hash(refreshToken)))
    if (!headers) return
    const value = headers.get('authorization')
    if (!value?.toLowerCase().startsWith('bearer ')) return
    const accessToken = value.slice(7).trim()
    if (accessToken) await this.token.admin.revoke(accessToken)
  }

  async resolveAuth(headers: Headers): Promise<AdminSession | null> {
    const value = headers.get('authorization')
    if (!value?.toLowerCase().startsWith('bearer ')) return null
    const token = value.slice(7).trim()
    if (!token) return null

    try {
      if (!(await this.token.admin.has(token))) return null
      const payload = await this.jwt.admin.verify(token)
      if (!payload?.sub) return null
      const adminId = Number(payload.sub)
      if (!Number.isFinite(adminId)) return null
      const tenantRaw = payload.tenantId
      const tenantId =
        typeof tenantRaw === 'number'
          ? tenantRaw
          : tenantRaw != null
            ? Number(tenantRaw)
            : null
      return {
        adminId,
        username: typeof payload.username === 'string' ? payload.username : undefined,
        tenantId: Number.isFinite(tenantId as number) ? (tenantId as number) : null,
        payload,
      }
    } catch {
      return null
    }
  }
}
