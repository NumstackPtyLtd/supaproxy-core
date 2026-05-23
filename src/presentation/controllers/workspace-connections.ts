import type { DeleteConnectionUseCase } from '../../application/workspace/DeleteConnectionUseCase.js'
import type { GetConnectionsUseCase } from '../../application/workspace/GetConnectionsUseCase.js'
import type { ListWorkspaceConsumersUseCase } from '../../application/workspace/ListWorkspaceConsumersUseCase.js'
import { type AuthUser, type AuthEnv } from '../middleware/auth.js'
import type { GuardFn } from '../helpers/guardWorkspace.js'

export interface WorkspaceConnectionRouteDeps {
  deleteConnectionUseCase: DeleteConnectionUseCase
  getConnectionsUseCase: GetConnectionsUseCase
  listWorkspaceConsumersUseCase: ListWorkspaceConsumersUseCase
  requireAuth: (c: import('hono').Context, next: import('hono').Next) => Promise<Response | void>
}

export function deleteConnection(deps: WorkspaceConnectionRouteDeps) {
  return async (c: import('hono').Context<AuthEnv>) => {
    await deps.deleteConnectionUseCase.execute(c.req.param('id')!)
    return c.json({ status: 'ok' })
  }
}

export function listConnections(deps: WorkspaceConnectionRouteDeps, guard: GuardFn) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const user = c.get('user') as AuthUser
    await guard(c.req.param('id')!, user.org_id)
    const result = await deps.getConnectionsUseCase.execute(c.req.param('id')!)
    return c.json(result)
  }
}

export function listConsumers(deps: WorkspaceConnectionRouteDeps, guard: GuardFn) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const user = c.get('user') as AuthUser
    await guard(c.req.param('id')!, user.org_id)
    const consumers = await deps.listWorkspaceConsumersUseCase.execute(c.req.param('id')!)
    return c.json({ consumers })
  }
}
