import { BaseController, Context, Controller, Get } from '/#/server'

/** 前端权限：登录态由 webAuth 的 auth macro 自动挂上（非 @Public） */
@Controller()
export class UserRbacController extends BaseController {
  @Get('/perms', { summary: '当前权限' })
  async perms() {
    const ctx = Context.get()
    const perms = (ctx?.appPerms as string[] | undefined) ?? []
    const openAll = Boolean(ctx?.appOpenAll)
    return this.ok({ perms, openAll })
  }
}
