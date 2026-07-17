import {
  Queue,
  Worker,
  type JobsOptions,
  type Job,
  type ConnectionOptions,
} from 'bullmq'
import type { QueueRedisConnection } from './connection'

export type JobHandler = (job: Job) => Promise<unknown>

/** Redis key 前缀（可含 `:`）；队列名本身禁止冒号 */
const REDIS_PREFIX = 'vome:job'

/** 任务队列（BullMQ）：可延迟、重试、并发；与 cron 定时任务无关 */
export class JobQueue {
  private readonly queues = new Map<string, Queue>()
  private readonly workers = new Map<string, Worker>()

  constructor(private readonly connection: QueueRedisConnection) {}

  private connOpts(): ConnectionOptions {
    return this.connection as unknown as ConnectionOptions
  }

  private queueOpts() {
    return {
      connection: this.connOpts(),
      prefix: REDIS_PREFIX,
    }
  }

  ensure(name: string): Queue {
    let q = this.queues.get(name)
    if (!q) {
      q = new Queue(name, this.queueOpts())
      this.queues.set(name, q)
    }
    return q
  }

  /** 投递任务 */
  async add(name: string, data: unknown, opts?: JobsOptions) {
    const q = this.ensure(name)
    return q.add(name, data ?? {}, opts)
  }

  /** 注册消费者（同名只注册一次） */
  process(name: string, handler: JobHandler, concurrency = 1) {
    if (this.workers.has(name)) return
    this.ensure(name)
    const worker = new Worker(name, async (job) => handler(job), {
      connection: this.connection.duplicate() as unknown as ConnectionOptions,
      prefix: REDIS_PREFIX,
      concurrency,
    })
    worker.on('failed', (job, err) => {
      console.error(`[JobQueue] ${name}#${job?.id} failed:`, err.message)
    })
    this.workers.set(name, worker)
  }

  listNames() {
    return [
      ...new Set([...this.queues.keys(), ...this.workers.keys()]),
    ].sort()
  }

  getQueue(name: string) {
    return this.queues.get(name) ?? this.ensure(name)
  }

  /**
   * 删除队列：先停 Worker，再 obliterate Redis，最后摘掉本地登记。
   * 只清 Queue 不关 Worker 时，BullMQ 会把元数据写回 Redis，刷新后队列「复活」。
   */
  async obliterate(name: string) {
    const worker = this.workers.get(name)
    if (worker) {
      await worker.close()
      this.workers.delete(name)
    }

    const q = this.queues.get(name) ?? new Queue(name, this.queueOpts())
    try {
      await q.obliterate({ force: true })
    } finally {
      await q.close().catch(() => undefined)
      this.queues.delete(name)
    }
  }

  async close() {
    await Promise.all([...this.workers.values()].map((w) => w.close()))
    await Promise.all([...this.queues.values()].map((q) => q.close()))
    this.workers.clear()
    this.queues.clear()
  }
}
