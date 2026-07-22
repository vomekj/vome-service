import { t } from 'elysia'
import {
  BaseController,
  Body,
  Controller,
  Inject,
  Post,
} from '/#/server'
import { aiCallLog } from '../../entity/call-log'
import { AiCallLogService } from '../../service/call-log'
import { AiGateway } from '../../service/gateway'

/** → service.ai.callLog（调用记录：同步/流式/异步） */
@Controller({
  api: ['page', 'list', 'info'],
  entity: aiCallLog,
  service: AiCallLogService,
  pageQueryOp: {
    keyWordLikeFields: ['recordKey', 'modelCode'],
    fieldEq: [
      { column: 'capability', dict: 'base_ai_capability' },
      { column: 'mode', dict: 'base_ai_result_mode' },
      { column: 'status', dict: 'base_ai_async_status' },
      { column: 'source', dict: 'base_ai_invoke_source' },
      'ok',
    ],
    addOrderBy: { id: 'desc' },
  },
  listQueryOp: {
    fieldEq: [
      { column: 'capability', dict: 'base_ai_capability' },
      { column: 'mode', dict: 'base_ai_result_mode' },
      { column: 'status', dict: 'base_ai_async_status' },
      'ok',
      'modelCode',
    ],
    addOrderBy: { id: 'desc' },
  },
})
export class AiCallLogController extends BaseController {
  @Inject()
  callLog: AiCallLogService

  @Inject()
  aiGateway: AiGateway

  @Post('/refresh', { summary: '刷新异步进度' })
  async refresh(
    @Body(t.Object({ recordKey: t.String() })) body: { recordKey: string },
  ) {
    const out = await this.aiGateway.call({ taskId: body.recordKey })
    return this.ok(out)
  }

  @Post('/retry', { summary: '失败异步重试' })
  async retry(
    @Body(t.Object({ recordKey: t.String() })) body: { recordKey: string },
  ) {
    const out = await this.aiGateway.retryAsync(body.recordKey)
    return this.ok(out)
  }

  @Post('/closeStale', { summary: '超时关单' })
  async closeStale(
    @Body(t.Optional(t.Object({ timeoutMs: t.Optional(t.Number()) })))
    body?: { timeoutMs?: number },
  ) {
    await this.aiGateway.closeStaleTasks(body?.timeoutMs)
    return this.ok(null)
  }
}
