import { t } from 'elysia'
import {
  BaseController,
  Body,
  Controller,
  Inject,
  Post,
  Public,
} from '/#/server'
import { UserWxService } from '../../service/wx'

@Controller({ description: 'App 用户通用' })
export class AppUserCommController extends BaseController {
  @Inject()
  wx: UserWxService

  @Public()
  @Post('/wxMpConfig', { summary: '获取微信公众号配置' })
  async wxMpConfig(
    @Body(t.Object({ url: t.String({ minLength: 1 }) })) body: { url: string },
  ) {
    return this.ok(await this.wx.getWxMpConfig(body.url))
  }
}
