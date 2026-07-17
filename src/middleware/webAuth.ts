import { Elysia } from 'elysia'
import { Context, Ioc } from '/#/server'
import { AuthService } from '../lib/auth'
import { UserPermissionService } from '../modules/user/service/rbac'

/** Better Auth 挂载 + 前端鉴权 macro（Cookie / session bearer / web JWT） */
export const webAuth = new Elysia({ name: 'better-auth' })
  .mount((request) => Ioc.get(AuthService).instance.handler(request))
  .macro({
    auth: {
      async resolve({ status, request: { headers } }) {
        const auth = await Ioc.get(AuthService).resolveWeb(headers)
        if (!auth) return status(401)

        const userId = String(auth.user.id)
        const authz = await Ioc.get(UserPermissionService).getUserAuthz(userId)
        const tenantId =
          (auth.user as { tenantId?: number | null }).tenantId ??
          (auth.kind === 'jwt' && auth.payload
            ? (auth.payload as { tenantId?: number | null }).tenantId
            : null) ??
          null
        Context({
          userId,
          appPerms: authz.perms,
          appOpenAll: authz.openAll,
          tenantId,
        })

        if (auth.kind === 'session') {
          return {
            user: auth.user,
            session: auth.session,
            perms: authz.perms,
            openAll: authz.openAll,
            tenantId,
          }
        }
        return {
          user: auth.user,
          perms: authz.perms,
          openAll: authz.openAll,
          tenantId,
        }
      },
    },
  })
  .as('scoped')
