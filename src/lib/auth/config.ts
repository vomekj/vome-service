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

/** 已配置密钥的社交 SSO；顺序跟 `auth.social` 配置键序，供登录页前 2 个常显 */
export function listEnabledSocialProviders(): string[] {
  const cfg = (VomeConfig.auth ?? {}) as AuthConfig
  const social = resolveAuthConfig().social ?? {}
  const cfgOrder = Object.keys(cfg.social ?? {})
  const fallbackOrder = ['github', 'google', 'wechat', 'gitee', 'steam']
  const seen = new Set<string>()
  const order: string[] = []
  for (const key of [...cfgOrder, ...fallbackOrder]) {
    if (seen.has(key)) continue
    seen.add(key)
    order.push(key)
  }
  return order.filter((key) => {
    const s = social[key as keyof typeof social] as
      | { clientId?: string; clientSecret?: string; apiKey?: string }
      | undefined
    if (!s) return false
    if (key === 'steam') return Boolean(s.apiKey)
    return Boolean(s.clientId && s.clientSecret)
  })
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
