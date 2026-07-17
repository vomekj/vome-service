import { t } from 'elysia'
import {
  BaseController,
  Controller,
  Eps,
  Get,
  Inject,
  Public,
  Query,
} from '/#/server'
import { AdminAuthService } from '../../service/auth'

const captchaQuery = t.Object({
  width: t.Optional(t.Numeric()),
  height: t.Optional(t.Numeric()),
  color: t.Optional(t.String()),
})

/** 后台开放接口（免登录） */
@Controller({ description: '开放接口' })
export class AdminOpenController extends BaseController {
  @Inject()
  auth: AdminAuthService

  @Public()
  @Get('/eps', { summary: '实体信息与路径' })
  eps() {
    return this.ok(Eps.admin())
  }

  @Public()
  @Get('/captcha', { summary: '图片验证码' })
  async captcha(
    @Query(captchaQuery)
    query: { width?: number; height?: number; color?: string },
  ) {
    const data = await this.auth.captcha(
      query.width ?? 150,
      query.height ?? 50,
      query.color ?? '#333333',
    )
    return this.ok(data)
  }
}
