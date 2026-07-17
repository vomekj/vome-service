import { Context, Ioc, defineAuthMacro } from '/#/server'
import { AdminAuthService } from '../modules/base/service/auth'
import { PermissionService } from '../modules/base/service/permission'

/** Admin JWT 鉴权 macro（解析逻辑在宿主，形态由 core defineAuthMacro 提供） */
export const adminAuth = defineAuthMacro('adminAuth', async ({ status, request }) => {
  const session = await Ioc.get(AdminAuthService).resolveAuth(request.headers)
  // 统一 JSON，避免前端拿到纯文本 Unauthorized
  if (!session) return status(401, { code: 1001, message: 'unauthorized' })

  const authz = await Ioc.get(PermissionService).getAdminAuthz(session.adminId)
  const dataScope = authz.dataScope ?? (authz.isSuper ? 'all' : 'none')
  const dataScopeDeptIds = authz.dataScopeDeptIds ?? []

  Context({
    adminId: session.adminId,
    username: session.username,
    tenantId: session.tenantId ?? null,
    isSuper: authz.isSuper,
    perms: authz.perms,
    dataScope,
    dataScopeDeptIds,
  })
  return {
    admin: session,
    isSuper: authz.isSuper,
    perms: authz.perms,
    tenantId: session.tenantId ?? null,
    dataScope,
    dataScopeDeptIds,
  }
})
