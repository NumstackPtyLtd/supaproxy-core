export interface QueueJobCounts {
  waiting: number
  active: number
  completed: number
  failed: number
  delayed: number
}

export interface FailedJob {
  id: string | undefined
  data: Record<string, unknown>
  failedReason: string | undefined
  timestamp: number | undefined
  attemptsMade: number
}

export interface JobOptions {
  removeOnComplete?: number
  removeOnFail?: number
}

export interface QueueConfig {
  name: string
  concurrency?: number
  jobOptions?: JobOptions
  handler?: (data: Record<string, unknown>) => Promise<void>
  scheduler?: { pattern?: string; every?: number; jobName: string }
}

/**
 * QueueService: generic queue abstraction.
 * Product-specific queue names and handlers are defined in core/cloud,
 * not in the adapter. The adapter receives queue configuration at startup.
 */
export interface QueueService {
  addJob(queueName: string, jobName: string, data: Record<string, unknown>, options?: JobOptions): Promise<void>
  scheduleJob(queueName: string, schedulerId: string, cron: string, jobName: string, data: Record<string, unknown>): Promise<void>
  cancelSchedule(queueName: string, schedulerId: string): Promise<void>
  getJobCounts(queueName: string): Promise<QueueJobCounts>
  getFailedJobs(queueName: string, limit: number): Promise<FailedJob[]>
  retryAllFailed(queueName: string): Promise<number>
  drainQueue(queueName: string): Promise<void>
  listQueueNames(): string[]
  queueExists(name: string): boolean
  startWorkers(queues: QueueConfig[]): Promise<void>
  stopWorkers(): Promise<void>
}
