import { t } from 'elysia'
import {
  BaseController,
  Body,
  Controller,
  Inject,
  Post,
} from '/#/server'
import { QueueAdminService } from '../../service/queue'

@Controller({
  prefix: '/base/queue',
  api: [],
})
export class QueueController extends BaseController {
  @Inject()
  queueAdmin: QueueAdminService

  @Post('/queues', { summary: '队列列表' })
  async queues() {
    return this.ok(await this.queueAdmin.listQueues())
  }

  @Post('/jobs', { summary: '队列内任务分页' })
  async jobs(
    @Body(
      t.Object({
        name: t.String({ minLength: 1 }),
        states: t.Optional(t.Array(t.String())),
        start: t.Optional(t.Numeric()),
        end: t.Optional(t.Numeric()),
      }),
    )
    body: {
      name: string
      states?: string[]
      start?: number
      end?: number
    },
  ) {
    return this.ok(
      await this.queueAdmin.getJobs({
        ...body,
        states: body.states as never,
      }),
    )
  }

  @Post('/enqueue', { summary: '投递任务' })
  async enqueue(
    @Body(
      t.Object({
        name: t.String({ minLength: 1 }),
        data: t.Optional(t.Any()),
        delay: t.Optional(t.Numeric()),
        attempts: t.Optional(t.Numeric()),
      }),
    )
    body: {
      name: string
      data?: unknown
      delay?: number
      attempts?: number
    },
  ) {
    const job = await this.queueAdmin.enqueue(body)
    return this.ok({ id: job.id, name: job.name })
  }

  @Post('/retry', { summary: '重试失败任务' })
  async retry(
    @Body(
      t.Object({
        name: t.String({ minLength: 1 }),
        jobId: t.String({ minLength: 1 }),
      }),
    )
    body: { name: string; jobId: string },
  ) {
    await this.queueAdmin.retry(body.name, body.jobId)
    return this.ok(true)
  }

  @Post('/remove', { summary: '删除任务' })
  async remove(
    @Body(
      t.Object({
        name: t.String({ minLength: 1 }),
        jobId: t.String({ minLength: 1 }),
      }),
    )
    body: { name: string; jobId: string },
  ) {
    await this.queueAdmin.remove(body.name, body.jobId)
    return this.ok(true)
  }

  @Post('/clean', { summary: '清理已完成/失败任务' })
  async clean(
    @Body(
      t.Object({
        name: t.String({ minLength: 1 }),
        status: t.Optional(
          t.Union([t.Literal('completed'), t.Literal('failed')]),
        ),
      }),
    )
    body: {
      name: string
      status?: 'completed' | 'failed'
    },
  ) {
    const removed = await this.queueAdmin.clean(
      body.name,
      body.status ?? 'completed',
    )
    return this.ok({ removed: removed.length })
  }

  @Post('/pause', { summary: '暂停队列' })
  async pause(
    @Body(
      t.Object({
        name: t.String({ minLength: 1 }),
      }),
    )
    body: { name: string },
  ) {
    await this.queueAdmin.pause(body.name)
    return this.ok(true)
  }

  @Post('/resume', { summary: '恢复队列' })
  async resume(
    @Body(
      t.Object({
        name: t.String({ minLength: 1 }),
      }),
    )
    body: { name: string },
  ) {
    await this.queueAdmin.resume(body.name)
    return this.ok(true)
  }

  @Post('/obliterate', { summary: '删除整个队列（含全部任务）' })
  async obliterate(
    @Body(
      t.Object({
        name: t.String({ minLength: 1 }),
      }),
    )
    body: { name: string },
  ) {
    await this.queueAdmin.obliterate(body.name)
    return this.ok(true)
  }
}
