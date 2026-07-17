import { Inject, Provide } from '/#/server'
import { QueueStore } from '../../../lib/queue'
import type { JobType } from 'bullmq'

@Provide()
export class QueueAdminService {
  @Inject()
  queue: QueueStore

  listQueues() {
    return this.queue.listQueues()
  }

  getJobs(body: {
    name: string
    states?: JobType[]
    start?: number
    end?: number
  }) {
    return this.queue.getJobs(body)
  }

  enqueue(body: {
    name: string
    data?: unknown
    delay?: number
    attempts?: number
  }) {
    return this.queue.enqueue(body)
  }

  retry(name: string, jobId: string) {
    return this.queue.retryJob(name, jobId)
  }

  remove(name: string, jobId: string) {
    return this.queue.removeJob(name, jobId)
  }

  clean(name: string, status: 'completed' | 'failed' = 'completed') {
    return this.queue.clean(name, 0, status)
  }

  pause(name: string) {
    return this.queue.pause(name)
  }

  resume(name: string) {
    return this.queue.resume(name)
  }

  obliterate(name: string) {
    return this.queue.obliterate(name)
  }
}
