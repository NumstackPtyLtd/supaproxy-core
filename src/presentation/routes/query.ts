import { Hono } from 'hono'
import type { AuthEnv } from '../middleware/auth.js'
import { createGuardWorkspace } from '../helpers/guardWorkspace.js'
import { type QueryRouteDeps, executeQuery } from '../controllers/query.js'

export type { QueryRouteDeps }

export function createQueryRoutes(deps: QueryRouteDeps) {
  const guardWorkspace = createGuardWorkspace(deps.workspaceRepo, deps.tenantService)

  const query = new Hono<AuthEnv>()

  query.use('/api/workspaces/*/query', deps.requireAuth)
  query.post('/api/workspaces/:id/query', executeQuery(deps, guardWorkspace))

  return query
}
