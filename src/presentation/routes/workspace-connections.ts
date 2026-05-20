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

export function createWorkspaceConnectionRoutes(deps: WorkspaceConnectionRouteDeps, guardWorkspace: (workspaceId: string, userOrgId: string) => Promise<void>) {
  const app = new Hono<AuthEnv>()

  app.delete('/api/connections/:id', async (c) => {
    await deps.deleteConnectionUseCase.execute(c.req.param('id'))
    return c.json({ status: 'ok' })
  })

  app.get('/api/workspaces/:id/connections', async (c) => {
    const user = c.get('user') as AuthUser
    await guardWorkspace(c.req.param('id'), user.org_id)
    const result = await deps.getConnectionsUseCase.execute(c.req.param('id'))
    return c.json(result)
  })

  app.get('/api/workspaces/:id/consumers', async (c) => {
    const user = c.get('user') as AuthUser
    await guardWorkspace(c.req.param('id'), user.org_id)
    const consumers = await deps.workspaceRepo.findConsumers(c.req.param('id'))
    return c.json({ consumers })
  })

  return app
}
