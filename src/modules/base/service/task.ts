import { and, desc, eq, inArray, isNull, lt, type SQL } from 'drizzle-orm'
import { CommException, Inject, Provide } from '/#/server'
import { InjectRepository, type Repository } from '/#/server'
import { BaseService } from '/#/server'
import { baseTask } from '../entity/task'
import { baseTaskLog } from '../entity/task-log'
import { TaskScheduler } from './task-scheduler'

/** 执行日志保留天数 */
const TASK_LOG_KEEP_DAYS = 20

@Provide()
export class TaskService extends BaseService {
  @InjectRepository(baseTask)
  taskRepo: Repository<typeof baseTask>
  @InjectRepository(baseTaskLog)
  taskLogRepo: Repository<typeof baseTaskLog>
  @Inject()
  scheduler: TaskScheduler

  async modifyAfter(data: any, type: 'add' | 'update' | 'delete') {
    if (type !== 'add' && type !== 'update') return
    const id = Number(data?.id)
    if (!Number.isFinite(id)) return
    const [row] = await this.taskRepo.find(
      and(eq(baseTask.id, id), isNull(baseTask.deletedAt)),
    )
    if (!row) return
    if (row.status === 1) this.scheduler.schedule(row)
    else this.scheduler.stop(row.id)
  }

  async delete(
    whereOrIds: SQL | number | string | Array<number | string>,
    options?: { softDelete?: boolean; force?: boolean },
  ) {
    const where = this.resolveIdWhere(whereOrIds)
    if (!where) return
    const rows = await this.taskRepo.find(where, { withTrashed: true })
    for (const row of rows) {
      this.scheduler.stop(row.id)
      await this.taskLogRepo.forceDelete(eq(baseTaskLog.taskId, row.id))
    }
    return super.delete(whereOrIds, options)
  }

  private resolveIdWhere(
    whereOrIds: SQL | number | string | Array<number | string>,
  ): SQL | undefined {
    if (
      whereOrIds &&
      typeof whereOrIds === 'object' &&
      !Array.isArray(whereOrIds) &&
      (whereOrIds as { getSQL?: unknown }).getSQL != null
    ) {
      return whereOrIds as SQL
    }
    const ids = (Array.isArray(whereOrIds) ? whereOrIds : [whereOrIds])
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id))
    if (!ids.length) return undefined
    return inArray(baseTask.id, ids)
  }

  async start(id: number) {
    const [row] = await this.taskRepo.find(
      and(eq(baseTask.id, id), isNull(baseTask.deletedAt)),
    )
    if (!row) throw new CommException('任务不存在')
    await this.taskRepo.update(eq(baseTask.id, id), { status: 1 })
    row.status = 1
    this.scheduler.schedule(row)
  }

  async stop(id: number) {
    const [row] = await this.taskRepo.find(
      and(eq(baseTask.id, id), isNull(baseTask.deletedAt)),
    )
    if (!row) throw new CommException('任务不存在')
    await this.taskRepo.update(eq(baseTask.id, id), { status: 0 })
    this.scheduler.stop(id)
  }

  /** 立即执行一次（不改 status） */
  async runOnce(id: number) {
    const [row] = await this.taskRepo.find(
      and(eq(baseTask.id, id), isNull(baseTask.deletedAt)),
    )
    if (!row) throw new CommException('任务不存在')
    await this.scheduler.runOnce(id)
  }

  /**
   * 执行记录分页
   * query: id=任务ID, status?, page?, size?
   */
  async log(query: {
    id: number
    status?: number | string
    page?: number
    size?: number
  }) {
    const taskId = Number(query.id)
    const page = Math.max(1, Number(query.page) || 1)
    const size = Math.min(100, Math.max(1, Number(query.size) || 20))

    const conds: SQL[] = [
      eq(baseTaskLog.taskId, taskId),
      isNull(baseTaskLog.deletedAt),
    ]
    if (query.status !== undefined && query.status !== '' && query.status !== null) {
      conds.push(eq(baseTaskLog.status, Number(query.status)))
    }
    const where = and(...conds)

    return this.taskLogRepo.findPage({
      page,
      size,
      where,
      orderBy: [desc(baseTaskLog.id)],
    })
  }

  /** 写入执行日志并清理过期 */
  async recordLog(taskId: number, status: 0 | 1, detail?: string) {
    await this.taskLogRepo.create({
      taskId,
      status,
      detail: detail || '',
    })
    const before = new Date()
    before.setDate(before.getDate() - TASK_LOG_KEEP_DAYS)
    const where = and(
      eq(baseTaskLog.taskId, taskId),
      lt(baseTaskLog.createTime, before),
    )
    if (where) await this.taskLogRepo.forceDelete(where)
  }
}
