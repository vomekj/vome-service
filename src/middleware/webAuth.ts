import { Elysia } from 'elysia'
import { Context, Ioc } from '@core/server'
import { eq } from 'drizzle-orm'
import { AuthService } from '../lib/auth'
import { DbStore } from '../lib/db'
import { userInfo } from '../modules/user/entity/info'
import { UserPermissionService } from '../modules/user/service/rbac'

type Db = {
  select: (fields: { userId: typeof userInfo.userId }) => {
    from: (table: typeof userInfo) => {
      where: (cond: ReturnType<typeof eq>) => {
        limit: (n: number) => Promise<Array<{ userId: number }>>
      }
    }
  }
}

function asPositiveInt(v: unknown): number | undefined {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

/**
 * JWT：只信票面 userId（claim / 数字 sub），不查库。
 * Session：优先 additionalFields.userId；没有则用 BA id 映射一次。
 */
async function resolveUserId(opts: {
  kind: 'session' | 'jwt'
  baId?: string
  hint?: number
}): Promise<number | undefined> {
  if (opts.hint != null) return opts.hint
  if (opts.kind !== 'session' || !opts.baId) return undefined
  const db = Ioc.get(DbStore).drizzle as Db
  const rows = await db
    .select({ userId: userInfo.userId })
    .from(userInfo)
    .where(eq(userInfo.id, opts.baId))
    .limit(1)
  return asPositiveInt(rows[0]?.userId)
}

/** Better Auth 挂载 + 前端鉴权 macro（Cookie / session bearer / web JWT） */
export const webAuth = new Elysia({ name: 'better-auth' })
  .mount((request) => Ioc.get(AuthService).instance.handler(request))
  .macro({
    auth: {
      async resolve({ status, request: { headers } }) {
        const auth = await Ioc.get(AuthService).resolveWeb(headers)
        if (!auth) return status(401)

        const payload =
          auth.kind === 'jwt' && auth.payload
            ? (auth.payload as Record<string, unknown>)
            : null
        const tenantId =
          (auth.user as { tenantId?: number | null }).tenantId ??
          (payload?.tenantId as number | null | undefined) ??
          null

        const hint =
          asPositiveInt(payload?.userId) ??
          asPositiveInt((auth.user as { userId?: number | null }).userId)
        const userId = await resolveUserId({
          kind: auth.kind,
          baId: auth.kind === 'session' ? String(auth.user.id) : undefined,
          hint,
        })
        if (userId == null) return status(401)

        const authz = await Ioc.get(UserPermissionService).getUserAuthz(userId)

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
            userId,
          }
        }
        return {
          user: auth.user,
          perms: authz.perms,
          openAll: authz.openAll,
          tenantId,
          userId,
        }
      },
    },
  })
  .as('scoped')
