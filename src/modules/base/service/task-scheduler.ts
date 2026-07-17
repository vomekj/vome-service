import { Cron } from 'croner'
import { and, eq, isNull } from 'drizzle-orm'
import { CommException, Inject, Ioc, listProviders, Logger, Provide } from '/#/server'
import { InjectRepository, type Repository } from '/#/server'
import { BaseService } from '/#/server'
import type { BaseTask } from '../entity/task'
import { baseTask } from '../entity/task'

type JobHandle = { stop: () => void }

@Provide()
export class TaskScheduler extends BaseService {
  @InjectRepository(baseTask)
  taskRepo: Repository<typeof baseTask>
  @Inject()
  logger: Logger

  private readonly jobs = new Map<number, JobHandle>()

  /** 启动所有 status=1 的任务 */
  async startAll() {
    const rows = await this.taskRepo.find(
      and(eq(baseTask.status, 1), isNull(baseTask.deletedAt)),
    )
    for (const row of rows) {
      try {
        this.schedule(row)
      } catch (e) {
        this.logger.error(
          `[Task] 启动失败 id=${row.id} ${e instanceof Error ? e.message : e}`,
        )
      }
    }
    this.logger.info(`[Task] scheduled ← ${this.jobs.size} job(s)`)
  }

  stopAll() {
    for (const [id, job] of this.jobs) {
      try {
        job.stop()
      } catch {
        /* ignore */
      }
      this.jobs.delete(id)
    }
  }

  stop(id: number) {
    const job = this.jobs.get(id)
    if (!job) return
    job.stop()
    this.jobs.delete(id)
  }

  /** 按任务类型注册：once 定时一次 / cron 循环 */
  schedule(row: BaseTask) {
    this.stop(row.id)
    if (row.status !== 1) return

    if (row.taskType === 'once') {
      this.scheduleOnce(row)
      return
    }
    this.scheduleCron(row)
  }

  /** 定时执行一次（Date / ISO） */
  scheduleOnce(row: BaseTask) {
    if (!row.startDate) {
      throw new CommException(`任务 ${row.id} once 缺少 startDate`)
    }
    const when = new Date(row.startDate)
    if (Number.isNaN(when.getTime())) {
      throw new CommException(`任务 ${row.id} startDate 无效`)
    }
    if (when.getTime() <= Date.now()) {
      this.logger.warn(`[Task] once 已过期，跳过 id=${row.id}`)
      return
    }

    const job = new Cron(
      when,
      { name: `task-${row.id}`, timezone: 'Asia/Shanghai' },
      () => void this.runTask(row.id),
    )
    this.jobs.set(row.id, job)
  }

  /** 按 cron 循环执行 */
  scheduleCron(row: BaseTask) {
    if (!row.cron) {
      throw new CommException(`任务 ${row.id} cron 缺少表达式`)
    }
    const job = new Cron(
      row.cron,
      { name: `task-${row.id}`, timezone: 'Asia/Shanghai' },
      () => void this.runTask(row.id),
    )
    this.jobs.set(row.id, job)
  }

  /** 立即执行一次（不改变调度） */
  async runOnce(id: number) {
    await this.runTask(id)
  }

  private async runTask(id: number) {
    const [row] = await this.taskRepo.find(
      and(eq(baseTask.id, id), isNull(baseTask.deletedAt)),
    )
    if (!row) {
      this.stop(id)
      return
    }
    if (row.status !== 1 && row.taskType === 'cron') {
      this.stop(id)
      return
    }

    try {
      const result = await this.invoke(row)
      // 成功时写 JSON.stringify(result)
      await this.recordLog(
        id,
        1,
        result === undefined ? '' : JSON.stringify(result),
      )
      await this.taskRepo.update(eq(baseTask.id, id), {
        lastRunTime: new Date(),
      })
      if (row.taskType === 'once') {
        await this.taskRepo.update(eq(baseTask.id, id), { status: 0 })
        this.stop(id)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      await this.recordLog(id, 0, msg)
      this.logger.error(
        `[Task] 执行失败 id=${id} ${row.service}.${row.method}: ${msg}`,
      )
    }
  }

  /** 懒取 TaskService，避免与 TaskService ↔ TaskScheduler 循环注入 */
  private async recordLog(taskId: number, status: 0 | 1, detail?: string) {
    const { TaskService } = await import('./task')
    await Ioc.get(TaskService).recordLog(taskId, status, detail)
  }

  private async invoke(row: BaseTask) {
    const instance = this.resolveService(row.service)
    const fn = (instance as Record<string, unknown>)[row.method]
    if (typeof fn !== 'function') {
      throw new Error(`方法不存在: ${row.service}.${row.method}`)
    }
    let params: unknown
    if (row.params) {
      try {
        params = JSON.parse(row.params)
      } catch {
        params = row.params
      }
    }
    return await (fn as (this: unknown, p?: unknown) => unknown).call(
      instance,
      params,
    )
  }

  private resolveService(serviceName: string) {
    const providers = listProviders()
    const hit = providers.find(
      (p) =>
        p.useClass.name === serviceName ||
        String(p.token) === serviceName,
    )
    if (!hit) {
      throw new Error(`未找到 Service: ${serviceName}（须 @Provide 且类名一致）`)
    }
    return Ioc.get(hit.useClass)
  }
}
