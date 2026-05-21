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

/**
 * LifecycleHandler — the callback interface that queue workers invoke.
 * Passed to startWorkers() so the queue adapter can trigger lifecycle scans,
 * cold messages, and stats generation without depending on use case types.
 */
export interface KnowledgeSyncJobData {
  orgId: string
  pluginId: string
  configId: string
}

export interface LifecycleHandler {
  runLifecycleScan(): Promise<void>
  sendColdMessage(data: { conversationId: string; consumerType: string; channel: string; externalThreadId: string }): Promise<void>
  generateStats(conversationId: string): Promise<void>
  runKnowledgeSync?(data: KnowledgeSyncJobData): Promise<void>
}

export interface QueueService {
  addColdMessage(data: { conversationId: string; consumerType: string; channel: string; externalThreadId: string }): Promise<void>
  addStatsJob(conversationId: string): Promise<void>
  addKnowledgeSyncJob(data: KnowledgeSyncJobData): Promise<void>
  scheduleKnowledgeSync(configId: string, cron: string): Promise<void>
  cancelKnowledgeSync(configId: string): Promise<void>
  getJobCounts(queueName: string): Promise<QueueJobCounts>
  getFailedJobs(queueName: string, limit: number): Promise<FailedJob[]>
  retryAllFailed(queueName: string): Promise<number>
  drainQueue(queueName: string): Promise<void>
  listQueueNames(): string[]
  queueExists(name: string): boolean
  startWorkers(handler: LifecycleHandler): Promise<void>
  stopWorkers(): Promise<void>
}
