import { Hono } from 'hono'
import type { ManageQueuesUseCase } from '../../application/queue/ManageQueuesUseCase.js'
import type { QueueService } from '../../application/ports/QueueService.js'
import type { AuthEnv } from '../middleware/auth.js'

interface QueueRouteDeps {
  manageQueuesUseCase: ManageQueuesUseCase
  queueService: QueueService
  requireAuth: (c: import('hono').Context, next: import('hono').Next) => Promise<Response | void>
}

function listQueues(deps: QueueRouteDeps) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const result = await deps.manageQueuesUseCase.listQueues()
    return c.json({ queues: result })
  }
}

function getFailedJobs(deps: QueueRouteDeps) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const name = c.req.param('name')!
    if (!deps.queueService.listQueueNames().includes(name)) {
      return c.json({ error: 'not_found' }, 404)
    }
    const jobs = await deps.manageQueuesUseCase.getFailedJobs(name)
    return c.json({ jobs })
  }
}

function retryAllFailed(deps: QueueRouteDeps) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const name = c.req.param('name')!
    if (!deps.queueService.listQueueNames().includes(name)) {
      return c.json({ error: 'not_found' }, 404)
    }
    const retried = await deps.manageQueuesUseCase.retryAll(name)
    return c.json({ status: 'ok', retried })
  }
}

function drainQueue(deps: QueueRouteDeps) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const name = c.req.param('name')!
    if (!deps.queueService.listQueueNames().includes(name)) {
      return c.json({ error: 'not_found' }, 404)
    }
    await deps.manageQueuesUseCase.drain(name)
    return c.json({ status: 'ok' })
  }
}

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
