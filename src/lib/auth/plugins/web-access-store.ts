import type { BetterAuthPlugin } from '@better-auth/core'
import { createAuthMiddleware } from '@better-auth/core/api'
import { Ioc } from '/#/server'
import { TokenService } from '../token'

/** 签发 web access JWT 时写入 Redis */
export function webAccessTokenStore(): BetterAuthPlugin {
  return {
    id: 'web-access-token-store',
    hooks: {
      after: [
        {
          matcher(ctx) {
            return ctx.path === '/token'
          },
          handler: createAuthMiddleware(async (ctx) => {
            const returned = ctx.context.returned as { token?: string } | undefined
            const token = returned?.token
            if (!token) return

            const userId =
              ctx.context.session?.user?.id ?? ctx.context.newSession?.user?.id
            await Ioc.get(TokenService).web.store(token, { sub: userId })
          }),
        },
        {
          matcher(ctx) {
            return ctx.path === '/get-session'
          },
          handler: createAuthMiddleware(async (ctx) => {
            const token = ctx.context.responseHeaders?.get('set-auth-jwt')
            if (!token) return

            const userId =
              ctx.context.session?.user?.id ?? ctx.context.newSession?.user?.id
            await Ioc.get(TokenService).web.store(token, { sub: userId })
          }),
        },
      ],
    },
  }
}
