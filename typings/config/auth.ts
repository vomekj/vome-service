/** 社交 SSO 单条配置（密钥 + 可选展示字段，登录页全自动用） */
export type SocialProviderConfig = {
  clientId?: string
  clientSecret?: string
  /** Steam 等用 apiKey */
  apiKey?: string
  /** 登录按钮文案；缺省走服务端内置默认 */
  label?: string
  /** Remix Icon class，如 ri-github-fill */
  icon?: string
  /** 图标色 */
  color?: string
}

/** 登录页 SSO 公开展示（不含密钥） */
export type SocialProviderPublic = {
  key: string
  label: string
  icon: string
  color: string
}

/** Better Auth 配置（字段均可选，便于 default 只写部分） */
export type AuthConfig = {
  /** 签名密钥，≥32 字符 */
  secret?: string
  baseURL?: string
  basePath?: string
  trustedOrigins?: string[]
  jwt?: {
    accessExpiresIn?: number
    refreshExpiresIn?: number
  }
  /**
   * 社交 SSO。键为 provider id（github/google/…）；
   * 登录页只消费 `GET /app/user/login/socialProviders` 返回的展示字段，前端勿硬编码对照表。
   */
  social?: {
    github?: SocialProviderConfig
    google?: SocialProviderConfig
    wechat?: SocialProviderConfig
    gitee?: SocialProviderConfig
    steam?: SocialProviderConfig
  }
}
