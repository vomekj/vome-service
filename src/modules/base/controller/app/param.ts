import { t } from 'elysia'
import {
  BaseController,
  Body,
  Controller,
  Inject,
  Post,
  Public,
} from '@core/server'
import { BaseParamService } from '../../service/param'

/**
 * App 系统参数（仅 openToApp=1；JSON 按键级开放过滤）
 */
@Controller({ description: 'App 系统参数' })
export class AppBaseParamController extends BaseController {
  @Inject()
  paramService: BaseParamService

  @Public()
  @Post('/get', { summary: '按 keyName 取值（可带 JSON path）' })
  async get(
    @Body(
      t.Object({
        keyName: t.String(),
        path: t.Optional(t.String()),
      }),
    )
    body: { keyName: string; path?: string },
  ) {
    return this.ok(
      await this.paramService.getForApp(body.keyName, body.path),
    )
  }

  @Public()
  @Post('/getByPath', { summary: '点路径取值，如 user.info.name' })
  async getByPath(
    @Body(t.Object({ path: t.String() }))
    body: { path: string },
  ) {
    return this.ok(await this.paramService.getByPathForApp(body.path))
  }
}
