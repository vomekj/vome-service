import { createRemoteJWKSet, jwtVerify, SignJWT } from 'jose'
import { Inject, Provide, VomeConfig } from '/#/server'
import type { AdminAccessJwtPayload } from '../../../typings/base/auth'
import { JWT_AUD } from '../../../typings/auth/jwt'
import { AuthExpires, resolveAuthConfig } from './config'
import { TokenService } from './token'

/**
 * JWT 签发与校验（可注入）
 *
 * - `admin.sign` / `admin.verify`
 * - `web.verify`
 */
@Provide()
export class JwtService {
  @Inject()
  token: TokenService

  private webJwks: ReturnType<typeof createRemoteJWKSet> | null = null

  private secretKey() {
    return new TextEncoder().encode(VomeConfig.keys as string)
  }

  private webJwksUrl() {
    const cfg = resolveAuthConfig()
    return new URL(`${cfg.basePath}/jwks`, cfg.baseURL)
  }

  readonly admin = {
    sign: async (userId: number, claims?: Record<string, unknown>) => {
      const cfg = resolveAuthConfig()
      return new SignJWT({ ...claims, aud: JWT_AUD.ADMIN })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(String(userId))
        .setIssuedAt()
        .setIssuer(cfg.baseURL)
        .setExpirationTime(AuthExpires.access.jwt())
        .sign(this.secretKey())
    },
    verify: async (token: string): Promise<AdminAccessJwtPayload | null> => {
      if (!(await this.token.admin.has(token))) return null

      const cfg = resolveAuthConfig()
      const { payload } = await jwtVerify<AdminAccessJwtPayload>(token, this.secretKey(), {
        issuer: cfg.baseURL,
        audience: JWT_AUD.ADMIN,
      })
      return payload
    },
  }

  readonly web = {
    /** 签发 App access JWT（HS256）；需配合 TokenService.web.store */
    sign: async (userId: string, claims?: Record<string, unknown>) => {
      const cfg = resolveAuthConfig()
      return new SignJWT({ ...claims, aud: JWT_AUD.WEB })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(String(userId))
        .setIssuedAt()
        .setIssuer(cfg.baseURL)
        .setExpirationTime(AuthExpires.access.jwt())
        .sign(this.secretKey())
    },
    verify: async (token: string) => {
      if (!(await this.token.web.has(token))) return null

      const cfg = resolveAuthConfig()
      try {
        const { payload } = await jwtVerify(token, this.secretKey(), {
          issuer: cfg.baseURL,
          audience: JWT_AUD.WEB,
        })
        return payload
      } catch {
        // Better Auth JWKS（邮箱登录等）
        if (!this.webJwks) this.webJwks = createRemoteJWKSet(this.webJwksUrl())
        const { payload } = await jwtVerify(token, this.webJwks, {
          issuer: cfg.baseURL,
          audience: JWT_AUD.WEB,
        })
        return payload
      }
    },
  }
}
