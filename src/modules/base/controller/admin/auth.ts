import { status } from 'elysia'
import { z } from 'zod'
import {
  BaseController,
  Body,
  Context,
  Controller,
  Get,
  IgnorePerms,
  Inject,
  isTenantEnabled,
  Post,
  Public,
} from '/#/server'
import { BaseUserSchema } from '../../entity/user'
import { AdminAuthService } from '../../service/auth'
import { PermissionService } from '../../service/permission'

const loginBody = BaseUserSchema.select
  .pick({ username: true, password: true })
  .extend({
    captchaId: z.string().min(1),
    verifyCode: z.string().min(1),
  })
const refreshBody = z.object({
  refreshToken: z.string().min(1),
})

const logoutBody = z.object({
  refreshToken: z.string().optional(),
})

@Controller()
export class AdminAuthController extends BaseController {
  @Inject()
  auth: AdminAuthService
  @Inject()
  permission: PermissionService

  @Public()
  @Post('/login', { summary: '登录' })
  async login(
    @Body(loginBody)
    body: {
      username: string
      password: string
      captchaId: string
      verifyCode: string
    },
  ) {
    const result = await this.auth.login(
      body.username,
      body.password,
      body.captchaId,
      body.verifyCode,
    )
    if ('error' in result) {
      const message =
        result.error === 'invalid_captcha'
          ? '验证码不正确'
          : '账户或密码不正确'
      const code = result.error === 'invalid_captcha' ? 400 : 401
      return status(code, this.fail(message))
    }
    return this.ok(result.data)
  }

  @Public()
  @Post('/refresh', { summary: '刷新令牌' })
  async refresh(@Body(refreshBody) body: { refreshToken: string }) {
    const result = await this.auth.refresh(body.refreshToken)
    if ('error' in result) return status(401, this.fail(result.error))
    return this.ok(result.data)
  }

  @Public()
  @Post('/logout', { summary: '退出登录' })
  async logout(
    @Body(logoutBody) body: { refreshToken?: string },
    ctx?: { request: Request },
  ) {
    await this.auth.logout(body.refreshToken || '', ctx?.request.headers)
    return this.ok({ ok: true })
  }

  @IgnorePerms()
  @Get('/me', { summary: '当前用户信息' })
  async me() {
    const ctx = Context.get()
    const adminId = Number(ctx?.adminId)
    if (!Number.isFinite(adminId)) return status(401, this.fail('unauthorized'))

    // adminAuth 已写入 Context，勿再查库
    return this.ok({
      adminId,
      username: ctx?.username,
      isSuper: Boolean(ctx?.isSuper),
      perms: (ctx?.perms as string[] | undefined) ?? [],
      tenantId: (ctx?.tenantId as number | null | undefined) ?? null,
      tenantEnabled: isTenantEnabled(),
      dataScope: (ctx?.dataScope as string | undefined) ?? 'none',
      dataScopeDeptIds: (ctx?.dataScopeDeptIds as number[] | undefined) ?? [],
    })
  }

  @IgnorePerms()
  @Get('/perms', { summary: '权限与菜单' })
  async perms() {
    const ctx = Context.get()
    const adminId = Number(ctx?.adminId)
    if (!Number.isFinite(adminId)) return status(401, this.fail('unauthorized'))

    // menus 需查库（未进 Context）
    const authz = await this.permission.getAdminAuthz(adminId)
    return this.ok({
      isSuper: authz.isSuper,
      perms: authz.perms,
      menus: authz.menus,
      tenantEnabled: authz.tenantEnabled ?? false,
      tenantId: (ctx?.tenantId as number | null | undefined) ?? null,
      dataScope: authz.dataScope ?? 'none',
      dataScopeDeptIds: authz.dataScopeDeptIds ?? [],
    })
  }
}
