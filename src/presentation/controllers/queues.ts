import type { ManageQueuesUseCase } from '../../application/queue/ManageQueuesUseCase.js'
import type { QueueService } from '../../application/ports/QueueService.js'
import type { AuthEnv } from '../middleware/auth.js'

export interface QueueRouteDeps {
  manageQueuesUseCase: ManageQueuesUseCase
  queueService: QueueService
  requireAuth: (c: import('hono').Context, next: import('hono').Next) => Promise<Response | void>
}

export function listQueues(deps: QueueRouteDeps) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const result = await deps.manageQueuesUseCase.listQueues()
    return c.json({ queues: result })
  }
}

export function getFailedJobs(deps: QueueRouteDeps) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const name = c.req.param('name')!
    // TODO: Move queue name validation into ManageQueuesUseCase
    if (!deps.queueService.listQueueNames().includes(name)) {
      return c.json({ error: 'not_found' }, 404)
    }
    const jobs = await deps.manageQueuesUseCase.getFailedJobs(name)
    return c.json({ jobs })
  }
}

export function retryAllFailed(deps: QueueRouteDeps) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const name = c.req.param('name')!
    // TODO: Move queue name validation into ManageQueuesUseCase
    if (!deps.queueService.listQueueNames().includes(name)) {
      return c.json({ error: 'not_found' }, 404)
    }
    const retried = await deps.manageQueuesUseCase.retryAll(name)
    return c.json({ status: 'ok', retried })
  }
}

export function drainQueue(deps: QueueRouteDeps) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const name = c.req.param('name')!
    // TODO: Move queue name validation into ManageQueuesUseCase
    if (!deps.queueService.listQueueNames().includes(name)) {
      return c.json({ error: 'not_found' }, 404)
    }
    await deps.manageQueuesUseCase.drain(name)
    return c.json({ status: 'ok' })
  }
}
