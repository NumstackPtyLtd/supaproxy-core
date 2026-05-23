import { Hono } from 'hono'
import type { DeleteConnectionUseCase } from '../../application/workspace/DeleteConnectionUseCase.js'
import type { GetConnectionsUseCase } from '../../application/workspace/GetConnectionsUseCase.js'
import type { WorkspaceRepository } from '../../domain/workspace/repository.js'
import type { TenantService } from '../../application/ports/TenantService.js'
import { type AuthUser, type AuthEnv } from '../middleware/auth.js'

interface WorkspaceConnectionRouteDeps {
  deleteConnectionUseCase: DeleteConnectionUseCase
  getConnectionsUseCase: GetConnectionsUseCase
  workspaceRepo: WorkspaceRepository
  tenantService: TenantService
  requireAuth: (c: import('hono').Context, next: import('hono').Next) => Promise<Response | void>
}

type GuardFn = (workspaceId: string, userOrgId: string) => Promise<void>

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
    const consumers = await deps.workspaceRepo.findConsumers(c.req.param('id')!)
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
