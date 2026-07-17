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
  social?: {
    github?: { clientId?: string; clientSecret?: string }
    google?: { clientId?: string; clientSecret?: string }
    wechat?: { clientId?: string; clientSecret?: string }
    gitee?: { clientId?: string; clientSecret?: string }
    steam?: { apiKey?: string }
  }
}
