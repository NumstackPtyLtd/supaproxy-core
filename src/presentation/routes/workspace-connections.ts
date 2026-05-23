import { Hono } from 'hono'
import type { AuthEnv } from '../middleware/auth.js'
import type { GuardFn } from '../helpers/guardWorkspace.js'
import {
  type WorkspaceConnectionRouteDeps,
  deleteConnection, listConnections, listConsumers,
} from '../controllers/workspace-connections.js'

export type { WorkspaceConnectionRouteDeps }

export function createWorkspaceConnectionRoutes(deps: WorkspaceConnectionRouteDeps, guardWorkspace: GuardFn) {
  const app = new Hono<AuthEnv>()

  app.delete('/api/connections/:id', deleteConnection(deps))
  app.get('/api/workspaces/:id/connections', listConnections(deps, guardWorkspace))
  app.get('/api/workspaces/:id/consumers', listConsumers(deps, guardWorkspace))

  return app
}
