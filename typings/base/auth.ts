import type { JWTPayload } from 'jose'

/** Admin access JWT payload（HS256，aud=admin） */
export interface AdminAccessJwtPayload extends JWTPayload {
  username?: string
  tenantId?: number | null
}

/** 登录 / 刷新成功返回的双 token */
export interface AdminTokenPayload {
  accessToken: string
  refreshToken: string
  expiresIn: number
}

export type AdminAuthError =
  | 'invalid_credentials'
  | 'invalid_refresh_token'
  | 'invalid_captcha'

/** Admin 鉴权 service 统一返回结构 */
export type AdminAuthResult =
  | { data: AdminTokenPayload }
  | { error: AdminAuthError }

/** Redis 中 admin refresh token 缓存体 */
export interface AdminRefreshCache {
  userId: number
  username: string
  tenantId?: number | null
}

/** resolveAuth 解析结果 */
export interface AdminSession {
  adminId: number
  username?: string
  tenantId?: number | null
  payload: AdminAccessJwtPayload
}
