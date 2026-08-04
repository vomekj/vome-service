import { VomeConfig } from '/#/server'
import type {
  AuthConfig,
  SocialProviderConfig,
  SocialProviderPublic,
} from '../../../typings/config/auth'

function env(key: string) {
  return Bun.env[key]
}

function oauthPair(prefix: string): SocialProviderConfig | undefined {
  const clientId = env(`${prefix}_CLIENT_ID`)
  const clientSecret = env(`${prefix}_CLIENT_SECRET`)
  if (clientId && clientSecret) return { clientId, clientSecret }
  return undefined
}

function isSocialEnabled(
  key: string,
  s: SocialProviderConfig | undefined,
): boolean {
  if (!s) return false
  if (key === 'steam') return Boolean(s.apiKey)
  return Boolean(s.clientId && s.clientSecret)
}

/** 展示字段一律来自 `auth.social.<key>` 配置；缺省仅用 key / 通用图标兜底 */
function toPublic(
  key: string,
  s: SocialProviderConfig,
): SocialProviderPublic {
  return {
    key,
    label: s.label?.trim() || key,
    icon: s.icon?.trim() || 'ri-login-circle-line',
    color: s.color?.trim() || '#4e5dff',
  }
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

  /** 配置优先；未写密钥时才用环境变量补密钥（不覆盖 label/icon/color） */
  const mergeSocial = (
    key: keyof NonNullable<AuthConfig['social']>,
    envPrefix?: string,
  ): SocialProviderConfig | undefined => {
    const fromCfg = cfg.social?.[key]
    if (key === 'steam') {
      const apiKey = fromCfg?.apiKey ?? env('STEAM_API_KEY')
      if (!apiKey && !fromCfg) return undefined
      return { ...fromCfg, apiKey: apiKey || fromCfg?.apiKey }
    }
    const pair = envPrefix ? oauthPair(envPrefix) : undefined
    if (!fromCfg && !pair) return undefined
    return { ...pair, ...fromCfg }
  }

  const social: AuthConfig['social'] = {
    github: mergeSocial('github', 'GITHUB'),
    google: mergeSocial('google', 'GOOGLE'),
    wechat: mergeSocial('wechat', 'WECHAT'),
    gitee: mergeSocial('gitee', 'GITEE'),
    steam: mergeSocial('steam'),
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

/**
 * 已启用社交 SSO 的公开展示列表（含 label/icon/color）。
 * 全部来自 `auth.social` 配置；登录页直接渲染，勿再写前后端对照表。
 */
export function listEnabledSocialProviders(): SocialProviderPublic[] {
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
  const out: SocialProviderPublic[] = []
  for (const key of order) {
    const s = social[key as keyof typeof social]
    if (!isSocialEnabled(key, s) || !s) continue
    out.push(toPublic(key, s))
  }
  return out
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
