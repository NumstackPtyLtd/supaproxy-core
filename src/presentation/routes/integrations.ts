import { Hono } from 'hono'
import type { AuthEnv } from '../middleware/auth.js'
import {
  type IntegrationRouteDeps,
  listIntegrations, activateIntegration, deactivateIntegration,
  listEntryPoints, createEntryPoint, updateEntryPoint, deleteEntryPoint,
} from '../controllers/integrations.js'

export type { IntegrationRouteDeps }

export function createIntegrationRoutes(deps: IntegrationRouteDeps) {
  const routes = new Hono<AuthEnv>()

  routes.use('/api/integrations/*', deps.requireAuth)
  routes.use('/api/integrations', deps.requireAuth)
  routes.use('/api/entry-points/*', deps.requireAuth)
  routes.use('/api/entry-points', deps.requireAuth)

  routes.get('/api/integrations', listIntegrations(deps))
  routes.post('/api/integrations/:type/activate', activateIntegration(deps))
  routes.post('/api/integrations/:type/deactivate', deactivateIntegration(deps))
  routes.get('/api/entry-points', listEntryPoints(deps))
  routes.post('/api/entry-points', createEntryPoint(deps))
  routes.put('/api/entry-points/:id', updateEntryPoint(deps))
  routes.delete('/api/entry-points/:id', deleteEntryPoint(deps))

  return routes
}
