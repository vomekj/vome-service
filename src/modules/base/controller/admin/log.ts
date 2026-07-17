import { t } from 'elysia'
import {
  BaseController,
  Body,
  Controller,
  Inject,
  Post,
  type QueryOp,
} from '/#/server'
import type { LogScope } from '../../../../../typings/base/log-scope'
import { baseLog } from '../../entity/log'
import { LogService } from '../../service/log'

const logQueryOp: QueryOp = {
  keyWordLikeFields: ['action', 'ip', 'userId'],
  fieldEq: ['side', 'method', 'status', 'logType'],
  fieldLike: [],
  fieldArray: [],
  fieldRange: [
    { column: 'createTime', min: 'startTime', max: 'endTime', type: 'day' },
    { column: 'duration', min: 'minDuration', max: 'maxDuration', type: 'int' },
  ],
  addOrderBy: { createTime: 'desc' },
}

@Controller({
  api: ['delete', 'info', 'list', 'page'],
  entity: baseLog,
  service: LogService,
  pageQueryOp: logQueryOp,
  listQueryOp: logQueryOp,
})
export class LogController extends BaseController {
  @Inject()
  logService: LogService

  @Post('/clear', { summary: '清空日志' })
  async clear(@Body(t.Object({ all: t.Optional(t.Boolean()) })) body: { all?: boolean }) {
    await this.logService.clear(body)
    return this.ok(true)
  }

  @Post('/setKeep', { summary: '设置保留天数' })
  async setKeep(@Body(t.Object({ value: t.Numeric() })) body: { value: number }) {
    await this.logService.setKeepDays(body.value)
    return this.ok(true)
  }

  @Post('/getKeep', { summary: '获取保留天数' })
  async getKeep() {
    return this.ok(await this.logService.getKeepDays())
  }

  @Post('/getScope', { summary: '获取写入日志范围' })
  async getScope() {
    return this.ok({
      value: await this.logService.getScopes(),
      options: this.logService.scopeOptions(),
    })
  }

  @Post('/setScope', { summary: '设置写入日志范围' })
  async setScope(
    @Body(t.Object({ value: t.Array(t.String()) })) body: { value: string[] },
  ) {
    const value = await this.logService.setScopes(body.value as LogScope[])
    return this.ok(value)
  }
}
