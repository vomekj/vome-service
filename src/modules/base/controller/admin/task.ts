import { t } from 'elysia'
import {
  BaseController,
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Query,
} from '/#/server'
import { baseTask } from '../../entity/task'
import { TaskService } from '../../service/task'

@Controller({
  api: ['add', 'delete', 'update', 'info', 'list', 'page', 'restore'],
  entity: baseTask,
  service: TaskService,
  pageQueryOp: {
    keyWordLikeFields: ['name', 'service', 'method'],
    fieldEq: [{ column: 'status', dict: 'status' }, 'taskType'],
    fieldLike: ['cron', 'remark'],
    fieldArray: [],
    fieldRange: [
      { column: 'createTime', min: 'startTime', max: 'endTime', type: 'day' },
      { column: 'startDate', min: 'startDateMin', max: 'startDateMax', type: 'day' },
    ],
    addOrderBy: { id: 'desc' },
  },
  listQueryOp: {
    keyWordLikeFields: ['name', 'service', 'method'],
    fieldEq: [{ column: 'status', dict: 'status' }, 'taskType'],
    fieldLike: ['cron', 'remark'],
    fieldArray: [],
    fieldRange: [
      { column: 'createTime', min: 'startTime', max: 'endTime', type: 'day' },
      { column: 'startDate', min: 'startDateMin', max: 'startDateMax', type: 'day' },
    ],
    addOrderBy: { id: 'desc' },
  },
})
export class TaskController extends BaseController {
  @Inject()
  taskService: TaskService

  @Post('/start', { summary: '启动任务' })
  async start(@Body(t.Object({ id: t.Numeric() })) body: { id: number }) {
    await this.taskService.start(body.id)
    return this.ok(true)
  }

  @Post('/stop', { summary: '停止任务' })
  async stop(@Body(t.Object({ id: t.Numeric() })) body: { id: number }) {
    await this.taskService.stop(body.id)
    return this.ok(true)
  }

  /** 立即跑一次 */
  @Post('/once', { summary: '立即执行' })
  async once(@Body(t.Object({ id: t.Numeric() })) body: { id: number }) {
    await this.taskService.runOnce(body.id)
    return this.ok(true)
  }

  /** 执行记录分页 */
  @Get('/log', { summary: '执行记录' })
  async log(
    @Query(
      t.Object({
        id: t.Numeric(),
        status: t.Optional(t.Numeric()),
        page: t.Optional(t.Numeric()),
        size: t.Optional(t.Numeric()),
      }),
    )
    query: {
      id: number
      status?: number
      page?: number
      size?: number
    },
  ) {
    return this.ok(await this.taskService.log(query))
  }
}
