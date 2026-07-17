import { Ioc, Logger } from '/#/server'
import {
  closeSharedQueueRedis,
  getSharedQueueRedis,
} from './connection'
import { QueueStore } from './store'

let store: QueueStore | undefined

async function bootstrap() {
  if (store) return
  const redis = getSharedQueueRedis()
  await redis.ping()
  store = new QueueStore(redis)
  Ioc.set(QueueStore, store)
  console.info('[Queue] JobQueue ready')
}

async function close() {
  await store?.close()
  store = undefined
  await closeSharedQueueRedis()
}

/**
 * Redis 队列生命周期（BullMQ）
 *
 * 不在启动时 ensure 任何队列；列表只反映真实登记/投递过的队列。
 * 删除后重启不会「复活」——除非业务代码再次 process/ensure。
 */
export const Queue = {
  bootstrap,
  close,
}

export { QueueStore } from './store'
export { JobQueue } from './job-queue'
