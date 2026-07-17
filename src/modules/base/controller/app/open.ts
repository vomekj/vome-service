import { BaseController, Controller, Eps, Get, Public } from '/#/server'

/** App 开放接口（免登录）；与 admin/open 对称 */
@Controller({ description: '开放接口' })
export class AppOpenController extends BaseController {
  @Public()
  @Get('/eps', { summary: '实体信息与路径' })
  eps() {
    return this.ok(Eps.app())
  }
}
