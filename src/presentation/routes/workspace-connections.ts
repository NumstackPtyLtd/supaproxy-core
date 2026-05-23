import { Hono } from 'hono'
import type { DeleteConnectionUseCase } from '../../application/workspace/DeleteConnectionUseCase.js'
import type { GetConnectionsUseCase } from '../../application/workspace/GetConnectionsUseCase.js'
import type { ListWorkspaceConsumersUseCase } from '../../application/workspace/ListWorkspaceConsumersUseCase.js'
import { type AuthUser, type AuthEnv } from '../middleware/auth.js'
import type { GuardFn } from '../helpers/guardWorkspace.js'

interface WorkspaceConnectionRouteDeps {
  deleteConnectionUseCase: DeleteConnectionUseCase
  getConnectionsUseCase: GetConnectionsUseCase
  listWorkspaceConsumersUseCase: ListWorkspaceConsumersUseCase
  requireAuth: (c: import('hono').Context, next: import('hono').Next) => Promise<Response | void>
}

function deleteConnection(deps: WorkspaceConnectionRouteDeps) {
  return async (c: import('hono').Context<AuthEnv>) => {
    await deps.deleteConnectionUseCase.execute(c.req.param('id')!)
    return c.json({ status: 'ok' })
  }
}

function listConnections(deps: WorkspaceConnectionRouteDeps, guard: GuardFn) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const user = c.get('user') as AuthUser
    await guard(c.req.param('id')!, user.org_id)
    const result = await deps.getConnectionsUseCase.execute(c.req.param('id')!)
    return c.json(result)
  }
}

function listConsumers(deps: WorkspaceConnectionRouteDeps, guard: GuardFn) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const user = c.get('user') as AuthUser
    await guard(c.req.param('id')!, user.org_id)
    const consumers = await deps.listWorkspaceConsumersUseCase.execute(c.req.param('id')!)
    return c.json({ consumers })
  }
}

export function createWorkspaceConnectionRoutes(deps: WorkspaceConnectionRouteDeps, guardWorkspace: GuardFn) {
  const app = new Hono<AuthEnv>()

  app.delete('/api/connections/:id', deleteConnection(deps))
  app.get('/api/workspaces/:id/connections', listConnections(deps, guardWorkspace))
  app.get('/api/workspaces/:id/consumers', listConsumers(deps, guardWorkspace))

  return app
}
