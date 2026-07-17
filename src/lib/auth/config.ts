import { VomeConfig } from '/#/server'
import type { AuthConfig } from '../../../typings/config/auth'

function env(key: string) {
  return Bun.env[key]
}

function oauthPair(prefix: string) {
  const clientId = env(`${prefix}_CLIENT_ID`)
  const clientSecret = env(`${prefix}_CLIENT_SECRET`)
  if (clientId && clientSecret) return { clientId, clientSecret }
  return undefined
}

export function resolveAuthConfig(): Required<Pick<AuthConfig, 'secret' | 'baseURL' | 'basePath'>> &
  AuthConfig {
  const cfg = (VomeConfig.auth ?? {}) as AuthConfig
  const port = (VomeConfig.system as { port?: number })?.port
  if (!cfg.baseURL && !env('BETTER_AUTH_URL') && (port == null || !Number.isFinite(Number(port)))) {
    throw new Error(
      '[auth] baseURL / BETTER_AUTH_URL / system.port is required in config',
    )
  }
  const baseURL = cfg.baseURL ?? env('BETTER_AUTH_URL') ?? `http://localhost:${port}`

  const social: AuthConfig['social'] = {
    github: cfg.social?.github ?? oauthPair('GITHUB'),
    google: cfg.social?.google ?? oauthPair('GOOGLE'),
    wechat: cfg.social?.wechat ?? oauthPair('WECHAT'),
    gitee: cfg.social?.gitee ?? oauthPair('GITEE'),
    steam: cfg.social?.steam ?? (env('STEAM_API_KEY') ? { apiKey: env('STEAM_API_KEY') } : undefined),
  }

  return {
    secret: VomeConfig.keys as string,
    baseURL,
    basePath: cfg.basePath ?? '/api/auth',
    trustedOrigins: cfg.trustedOrigins,
    jwt: cfg.jwt,
    social,
  }
}

/** 已配置密钥的社交 SSO，供登录页动态展示 */
export function listEnabledSocialProviders(): string[] {
  const social = resolveAuthConfig().social ?? {}
  const list: string[] = []
  if (social.github?.clientId && social.github.clientSecret) list.push('github')
  if (social.google?.clientId && social.google.clientSecret) list.push('google')
  if (social.wechat?.clientId && social.wechat.clientSecret) list.push('wechat')
  if (social.gitee?.clientId && social.gitee.clientSecret) list.push('gitee')
  if (social.steam?.apiKey) list.push('steam')
  return list
}

const DEFAULT_ACCESS_SECONDS = 15 * 60
const DEFAULT_REFRESH_SECONDS = 60 * 60 * 24 * 7

export const AuthExpires = {
  access: {
    seconds() {
      return resolveAuthConfig().jwt?.accessExpiresIn ?? DEFAULT_ACCESS_SECONDS
    },
    ms() {
      return AuthExpires.access.seconds() * 1000
    },
    jwt() {
      return `${AuthExpires.access.seconds()}s`
    },
  },
  refresh: {
    seconds() {
      return resolveAuthConfig().jwt?.refreshExpiresIn ?? DEFAULT_REFRESH_SECONDS
    },
    ms() {
      return AuthExpires.refresh.seconds() * 1000
    },
  },
}
