/** JWT aud 声明映射 */
export const JWT_AUD = {
  WEB: 'web',
  ADMIN: 'admin',
} as const

export type JwtAud = (typeof JWT_AUD)[keyof typeof JWT_AUD]
