import { BaseController, Controller, Eps, Get, Inject, Public } from '/#/server'
import { DictInfoService } from '../../service/dict'

/** App 开放接口（免登录）；与 admin/open 对称 */
@Controller({ description: '开放接口' })
export class AppOpenController extends BaseController {
  @Inject()
  dictInfo: DictInfoService

  @Public()
  @Get('/eps', { summary: '实体信息与路径（含完整字典）' })
  async eps() {
    return this.ok({
      eps: Eps.enabled(),
      modules: Eps.app(),
      dict: await this.dictInfo.data([]),
    })
  }
}
