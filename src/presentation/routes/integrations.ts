import { Hono } from 'hono'
import { z } from 'zod'
import type { ManageIntegrationUseCase } from '../../application/integration/ManageIntegrationUseCase.js'
import type { ManageEntryPointUseCase } from '../../application/integration/ManageEntryPointUseCase.js'
import type { IntegrationRepository } from '../../domain/integration/repository.js'
import type { EntryPointRepository } from '../../domain/integration/repository.js'
import { parseBody } from '../middleware/validate.js'
import type { AuthUser, AuthEnv } from '../middleware/auth.js'
import { NotFoundError, ValidationError } from '../../domain/shared/errors.js'

const createEntryPointSchema = z.object({
  type: z.string().min(1).max(50),
  channel_id: z.string().min(1).max(255),
  channel_name: z.string().max(255).optional(),
  direct: z.boolean().optional(),
  direct_workspace_id: z.string().max(64).optional(),
})

const updateEntryPointSchema = z.object({
  channel_name: z.string().max(255).optional(),
  direct: z.boolean().optional(),
  direct_workspace_id: z.string().max(64).nullable().optional(),
})

interface IntegrationRouteDeps {
  manageIntegrationUseCase: ManageIntegrationUseCase
  manageEntryPointUseCase: ManageEntryPointUseCase
  integrationRepo: IntegrationRepository
  entryPointRepo: EntryPointRepository
  requireAuth: (c: import('hono').Context, next: import('hono').Next) => Promise<Response | void>
}

export function createIntegrationRoutes(deps: IntegrationRouteDeps) {
  const routes = new Hono<AuthEnv>()

  routes.use('/api/integrations/*', deps.requireAuth)
  routes.use('/api/integrations', deps.requireAuth)
  routes.use('/api/entry-points/*', deps.requireAuth)
  routes.use('/api/entry-points', deps.requireAuth)

  // GET /api/integrations - list active integrations for the org
  routes.get('/api/integrations', async (c) => {
    const user = c.get('user') as AuthUser
    const integrations = await deps.manageIntegrationUseCase.listIntegrations(user.org_id)
    return c.json({ integrations })
  })

  // POST /api/integrations/:type/activate - activate a consumer type
  routes.post('/api/integrations/:type/activate', async (c) => {
    const user = c.get('user') as AuthUser
    await deps.manageIntegrationUseCase.activate(user.org_id, c.req.param('type'))
    return c.json({ status: 'ok' })
  })

  // POST /api/integrations/:type/deactivate - deactivate a consumer type
  routes.post('/api/integrations/:type/deactivate', async (c) => {
    const user = c.get('user') as AuthUser
    await deps.manageIntegrationUseCase.deactivate(user.org_id, c.req.param('type'))
    return c.json({ status: 'ok' })
  })

  // GET /api/entry-points - list all entry points for the org
  routes.get('/api/entry-points', async (c) => {
    const user = c.get('user') as AuthUser
    const entryPoints = await deps.entryPointRepo.findByOrg(user.org_id)
    return c.json({ entryPoints })
  })

  // POST /api/entry-points - create a new entry point
  routes.post('/api/entry-points', async (c) => {
    const user = c.get('user') as AuthUser
    const body = await parseBody(c, createEntryPointSchema)
    if (!body.success) return body.response

    try {
      await deps.manageEntryPointUseCase.createEntryPoint(user.org_id, body.data.type, {
        channel_id: body.data.channel_id,
        channel_name: body.data.channel_name,
        direct: body.data.direct,
        direct_workspace_id: body.data.direct_workspace_id,
      })
      return c.json({ status: 'ok' })
    } catch (err) {
      if (err instanceof NotFoundError) return c.json({ error: 'integration_not_found' }, 404)
      throw err
    }
  })

  // PUT /api/entry-points/:id - update an entry point
  routes.put('/api/entry-points/:id', async (c) => {
    const body = await parseBody(c, updateEntryPointSchema)
    if (!body.success) return body.response

    try {
      await deps.manageEntryPointUseCase.updateEntryPoint(c.req.param('id'), body.data)
      return c.json({ status: 'ok' })
    } catch (err) {
      if (err instanceof NotFoundError) return c.json({ error: 'not_found' }, 404)
      throw err
    }
  })

  // DELETE /api/entry-points/:id - delete an entry point
  routes.delete('/api/entry-points/:id', async (c) => {
    try {
      await deps.manageEntryPointUseCase.deleteEntryPoint(c.req.param('id'))
      return c.json({ status: 'ok' })
    } catch (err) {
      if (err instanceof NotFoundError) return c.json({ error: 'not_found' }, 404)
      throw err
    }
  })

  return routes
}
