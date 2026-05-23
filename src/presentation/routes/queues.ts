import { Hono } from 'hono'
import type { AuthEnv } from '../middleware/auth.js'
import {
  type QueueRouteDeps,
  listQueues, getFailedJobs, retryAllFailed, drainQueue,
} from '../controllers/queues.js'

export type { QueueRouteDeps }

export function createQueueRoutes(deps: QueueRouteDeps) {
  const queues = new Hono<AuthEnv>()

  queues.use('/api/org/queues/*', deps.requireAuth)
  queues.use('/api/org/queues', deps.requireAuth)

  queues.get('/api/org/queues', listQueues(deps))
  queues.get('/api/org/queues/:name/failed', getFailedJobs(deps))
  queues.post('/api/org/queues/:name/retry-all', retryAllFailed(deps))
  queues.post('/api/org/queues/:name/drain', drainQueue(deps))

  return queues
}
