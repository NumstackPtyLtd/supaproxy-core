import { Hono } from 'hono'
import type { ManageQueuesUseCase } from '../../application/queue/ManageQueuesUseCase.js'
import type { QueueService } from '../../application/ports/QueueService.js'
import type { AuthEnv } from '../middleware/auth.js'

interface QueueRouteDeps {
  manageQueuesUseCase: ManageQueuesUseCase
  queueService: QueueService
  requireAuth: (c: import('hono').Context, next: import('hono').Next) => Promise<Response | void>
}

export function createQueueRoutes(deps: QueueRouteDeps) {
  const queues = new Hono<AuthEnv>()

  queues.use('/api/org/queues/*', deps.requireAuth)
  queues.use('/api/org/queues', deps.requireAuth)

  queues.get('/api/org/queues', async (c) => {
    const result = await deps.manageQueuesUseCase.listQueues()
    return c.json({ queues: result })
  })

  queues.get('/api/org/queues/:name/failed', async (c) => {
    const name = c.req.param('name')
    if (!deps.queueService.listQueueNames().includes(name)) {
      return c.json({ error: 'not_found' }, 404)
    }
    const jobs = await deps.manageQueuesUseCase.getFailedJobs(name)
    return c.json({ jobs })
  })

  queues.post('/api/org/queues/:name/retry-all', async (c) => {
    const name = c.req.param('name')
    if (!deps.queueService.listQueueNames().includes(name)) {
      return c.json({ error: 'not_found' }, 404)
    }
    const retried = await deps.manageQueuesUseCase.retryAll(name)
    return c.json({ status: 'ok', retried })
  })

  queues.post('/api/org/queues/:name/drain', async (c) => {
    const name = c.req.param('name')
    if (!deps.queueService.listQueueNames().includes(name)) {
      return c.json({ error: 'not_found' }, 404)
    }
    await deps.manageQueuesUseCase.drain(name)
    return c.json({ status: 'ok' })
  })

  return queues
}
