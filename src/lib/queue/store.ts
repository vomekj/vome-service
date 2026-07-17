import type { Job, JobType } from 'bullmq'
import { JobQueue } from './job-queue'
import type { QueueRedisConnection } from './connection'

/** 业务注入 + 后台管理统一入口 */
export class QueueStore {
  readonly jobs: JobQueue

  constructor(connection: QueueRedisConnection) {
    this.jobs = new JobQueue(connection)
  }

  private q(name: string) {
    return this.jobs.getQueue(name)
  }

  /** 已登记队列列表（含计数） */
  async listQueues() {
    const rows: Array<{
      name: string
      waiting: number
      active: number
      completed: number
      failed: number
      delayed: number
      paused: boolean
    }> = []

    for (const name of this.jobs.listNames()) {
      const q = this.q(name)
      const counts = await q.getJobCounts(
        'waiting',
        'active',
        'completed',
        'failed',
        'delayed',
        'paused',
      )
      rows.push({
        name,
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        completed: counts.completed ?? 0,
        failed: counts.failed ?? 0,
        delayed: counts.delayed ?? 0,
        paused: (await q.isPaused()) === true,
      })
    }
    return rows
  }

  async getJobs(input: {
    name: string
    states?: JobType[]
    start?: number
    end?: number
  }) {
    const states = input.states?.length
      ? input.states
      : (['waiting', 'active', 'delayed', 'completed', 'failed'] as JobType[])
    const start = input.start ?? 0
    const end = input.end ?? 49
    const jobs = await this.q(input.name).getJobs(states, start, end, true)
    return jobs.map((j) => this.serializeJob(j))
  }

  async retryJob(name: string, jobId: string) {
    const job = await this.q(name).getJob(jobId)
    if (!job) throw new Error(`任务不存在: ${jobId}`)
    await job.retry()
    return true
  }

  async removeJob(name: string, jobId: string) {
    const job = await this.q(name).getJob(jobId)
    if (!job) throw new Error(`任务不存在: ${jobId}`)
    await job.remove()
    return true
  }

  async clean(
    name: string,
    graceMs = 0,
    status: 'completed' | 'failed' = 'completed',
  ) {
    return this.q(name).clean(graceMs, 1000, status)
  }

  async pause(name: string) {
    await this.q(name).pause()
    return true
  }

  async resume(name: string) {
    await this.q(name).resume()
    return true
  }

  /** 删除整个队列（含全部任务） */
  async obliterate(name: string) {
    await this.jobs.obliterate(name)
    return true
  }

  /** 管理端投递（队列由业务 process/ensure 注册，此处不内置测试消费者） */
  async enqueue(input: {
    name: string
    data?: unknown
    delay?: number
    attempts?: number
  }) {
    return this.jobs.add(input.name, input.data ?? {}, {
      delay: input.delay,
      attempts: input.attempts ?? 3,
      backoff: { type: 'exponential' as const, delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 200,
    })
  }

  private serializeJob(job: Job) {
    return {
      id: job.id,
      name: job.name,
      data: job.data,
      opts: job.opts,
      progress: job.progress,
      attemptsMade: job.attemptsMade,
      timestamp: job.timestamp,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
      failedReason: job.failedReason,
      returnvalue: job.returnvalue,
      delay: job.delay,
    }
  }

  async close() {
    await this.jobs.close()
  }
}
