import { betterAuth } from 'better-auth'
import type { BetterAuthPlugin } from '@better-auth/core'
import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { bearer, genericOAuth, jwt } from 'better-auth/plugins'
import { Ioc, VomeConfig, isTenantEnabled } from '/#/server'
import type { DbConfig, DbType } from '../../../typings/config/db'
import { CacheStore } from '../cache'
import { createSecondaryStorage } from '../cache/secondary-storage'
import { DbStore } from '../db'
import { userAccount } from '../../modules/user/entity/account'
import { userJwks } from '../../modules/user/entity/jwks'
import { userInfo } from '../../modules/user/entity/info'
import { userVerification } from '../../modules/user/entity/verification'
import { TenantService } from '../../modules/base/service/tenant'
import { JWT_AUD } from '../../../typings/auth/jwt'
import { AuthExpires, resolveAuthConfig } from './config'
import { JwtService } from './jwt'
import { steamOpenId } from './plugins/steam'
import { webAccessTokenStore } from './plugins/web-access-store'

type AuthDb = Parameters<typeof drizzleAdapter>[0]
type AuthInstance = ReturnType<typeof createAuthInstance>

function drizzleProvider(type: DbType): 'pg' | 'mysql' | 'sqlite' {
  if (type === 'postgresql') return 'pg'
  if (type === 'mysql' || type === 'mariadb') return 'mysql'
  return 'sqlite'
}

function buildSocialProviders(cfg: ReturnType<typeof resolveAuthConfig>) {
  const social = cfg.social ?? {}
  const providers: Record<string, { clientId: string; clientSecret: string }> = {}

  if (social.github?.clientId && social.github.clientSecret) {
    providers.github = {
      clientId: social.github.clientId,
      clientSecret: social.github.clientSecret,
    }
  }

  if (social.google?.clientId && social.google.clientSecret) {
    providers.google = {
      clientId: social.google.clientId,
      clientSecret: social.google.clientSecret,
    }
  }

  if (social.wechat?.clientId && social.wechat.clientSecret) {
    providers.wechat = {
      clientId: social.wechat.clientId,
      clientSecret: social.wechat.clientSecret,
    }
  }

  return providers
}

function buildPlugins(cfg: ReturnType<typeof resolveAuthConfig>): BetterAuthPlugin[] {
  const plugins: BetterAuthPlugin[] = [
    jwt({
      jwt: {
        issuer: cfg.baseURL,
        audience: JWT_AUD.WEB,
        expirationTime: AuthExpires.access.jwt(),
        definePayload: ({ user }) => ({
          id: user.id,
          email: user.email,
          name: user.name,
          tenantId: (user as { tenantId?: number | null }).tenantId ?? null,
        }),
      },
    }),
    bearer(),
    webAccessTokenStore(),
  ]
  const social = cfg.social ?? {}

  const gitee = social.gitee
  if (gitee?.clientId && gitee.clientSecret) {
    plugins.push(
      genericOAuth({
        config: [
          {
            providerId: 'gitee',
            clientId: gitee.clientId,
            clientSecret: gitee.clientSecret,
            authorizationUrl: 'https://gitee.com/oauth/authorize',
            tokenUrl: 'https://gitee.com/oauth/token',
            userInfoUrl: 'https://gitee.com/api/v5/user',
            scopes: ['user_info'],
            mapProfileToUser(profile) {
              return {
                name: profile.name ?? profile.login,
                image: profile.avatar_url,
                email: profile.email ?? `${profile.id}@gitee.invalid`,
                emailVerified: !!profile.email,
              }
            },
          },
        ],
      }),
    )
  }

  if (social.steam?.apiKey) {
    plugins.push(steamOpenId({ apiKey: social.steam.apiKey }) as BetterAuthPlugin)
  }

  return plugins
}

function createAuthInstance(db: AuthDb, dbType: DbType) {
  const cfg = resolveAuthConfig()

  return betterAuth({
    secret: cfg.secret,
    baseURL: cfg.baseURL,
    basePath: cfg.basePath,
    trustedOrigins: cfg.trustedOrigins,
    session: {
      expiresIn: AuthExpires.refresh.seconds(),
      updateAge: 60 * 60 * 24,
    },
    secondaryStorage: createSecondaryStorage(Ioc.get(CacheStore)),
    database: drizzleAdapter(db, {
      provider: drizzleProvider(dbType),
      schema: {
        user: userInfo,
        account: userAccount,
        verification: userVerification,
        jwks: userJwks,
      },
    }),
    emailAndPassword: { enabled: true },
    user: {
      additionalFields: {
        tenantId: {
          type: 'number',
          required: false,
          input: false,
        },
      },
    },
    databaseHooks: {
      user: {
        create: {
          async before(user) {
            if (!isTenantEnabled()) return { data: user }
            const tenantId = await Ioc.get(TenantService).resolveTenantIdFromRequest()
            return { data: { ...user, tenantId } }
          },
        },
      },
    },
    socialProviders: buildSocialProviders(cfg),
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ['github', 'google', 'wechat', 'gitee', 'steam'],
      },
    },
    plugins: buildPlugins(cfg),
  })
}

function bearerToken(headers: Headers) {
  const value = headers.get('authorization')
  if (!value?.toLowerCase().startsWith('bearer ')) return null
  return value.slice(7).trim()
}

/**
 * Better Auth 运行时（可注入）
 *
 * - `instance` — handler / api
 * - `config` — 合并后的配置
 * - `resolveWeb(headers)` — 前端鉴权
 */
export class AuthService {
  constructor(private readonly auth: AuthInstance) {}

  get instance() {
    return this.auth
  }

  get config() {
    return resolveAuthConfig()
  }

  async resolveWeb(headers: Headers) {
    const session = await this.auth.api.getSession({ headers })
    if (session) {
      return {
        kind: 'session' as const,
        user: session.user,
        session: session.session,
      }
    }

    const token = bearerToken(headers)
    if (!token) return null

    try {
      // JwtService 在 bootstrapIoc 之后才可用，请求时再取
      const payload = await Ioc.get(JwtService).web.verify(token)
      if (!payload?.sub) return null
      return {
        kind: 'jwt' as const,
        user: {
          id: String(payload.sub),
          email: typeof payload.email === 'string' ? payload.email : undefined,
          name: typeof payload.name === 'string' ? payload.name : undefined,
        },
        payload,
      }
    } catch {
      return null
    }
  }
}

async function bootstrap() {
  const db = Ioc.get(DbStore)
  const dbType = (VomeConfig.db as DbConfig).type
  const instance = createAuthInstance(db.drizzle as AuthDb, dbType)
  Ioc.set(AuthService, new AuthService(instance))
}

/**
 * Better Auth 生命周期
 *
 * - `Auth.bootstrap()` — 须在 Db / Cache bootstrap 之后
 * - 访问：`@Inject() auth: AuthService` 或 `Ioc.get(AuthService)`
 * - 有效期纯配置：`AuthExpires`（`./config`）
 */
export const Auth = {
  bootstrap,
}

/** Better Auth CLI 入口（npx auth generate --config 指向 cli.ts） */
export const auth = new Proxy({} as AuthInstance, {
  get(_target, prop, receiver) {
    return Reflect.get(Ioc.get(AuthService).instance, prop, receiver)
  },
})
