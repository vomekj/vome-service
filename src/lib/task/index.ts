import { Cron } from 'croner'
import { and, eq } from 'drizzle-orm'
import { getRepository, Ioc, Logger } from '/#/server'
import { baseTask } from '../../modules/base/entity/task'
import { baseTaskLog } from '../../modules/base/entity/task-log'
import { LogService } from '../../modules/base/service/log'
import { TaskScheduler } from '../../modules/base/service/task-scheduler'

/**
 * 定时任务生命周期（IoC 就绪后由 core 调用）
 *
 * - 内置：请求日志过期清理（不进 base_task）
 * - 业务：`base_task` → TaskScheduler
 */
export const Task = {
  async bootstrap() {
    await startBuiltinLogCleanup()
    await Ioc.get(TaskScheduler).startAll()
  },
  async close() {
    stopBuiltinLogCleanup()
    Ioc.get(TaskScheduler).stopAll()
  },
}

/** 每天 02:00 */
const LOG_CLEANUP_CRON = '0 0 2 * * *'

let logCleanupJob: { stop: () => void } | null = null

async function startBuiltinLogCleanup() {
  await purgeLegacyLogCleanupTask()
  stopBuiltinLogCleanup()
  logCleanupJob = new Cron(
    LOG_CLEANUP_CRON,
    { name: 'builtin-log-cleanup', timezone: 'Asia/Shanghai' },
    () => void runBuiltinLogCleanup(),
  )
  Ioc.get(Logger).info(`[Task] builtin log cleanup ← ${LOG_CLEANUP_CRON}`)
}

function stopBuiltinLogCleanup() {
  logCleanupJob?.stop()
  logCleanupJob = null
}

async function runBuiltinLogCleanup() {
  const logger = Ioc.get(Logger)
  const started = Date.now()
  try {
    logger.info('[Task] 清除请求日志开始')
    await Ioc.get(LogService).clear()
    logger.info(`[Task] 清除请求日志结束，耗时:${Date.now() - started}ms`)
  } catch (e) {
    logger.error(
      `[Task] 清除请求日志失败: ${e instanceof Error ? e.message : e}`,
    )
  }
}

/** 历史把清理写进 base_task，启动时清掉，避免再被误删/误停 */
async function purgeLegacyLogCleanupTask() {
  const taskRepo = getRepository(baseTask)
  const logRepo = getRepository(baseTaskLog)
  const rows = await taskRepo.find(
    and(eq(baseTask.service, 'LogService'), eq(baseTask.method, 'clear')),
    { withTrashed: true },
  )
  if (!rows.length) return
  for (const row of rows) {
    await logRepo.forceDelete(eq(baseTaskLog.taskId, row.id))
    await taskRepo.forceDelete(eq(baseTask.id, row.id))
  }
  Ioc.get(Logger).info(
    `[Task] removed legacy LogService.clear from base_task ← ${rows.length}`,
  )
}
