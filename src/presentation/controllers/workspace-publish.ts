import type { PublishWorkspaceUseCase } from '../../application/workspace/PublishWorkspaceUseCase.js'
import type { TenantService } from '../../application/ports/TenantService.js'
import { type AuthUser, type AuthEnv } from '../middleware/auth.js'
import { NotFoundError } from '../../domain/shared/errors.js'

export interface WorkspacePublishRouteDeps {
  publishWorkspaceUseCase: PublishWorkspaceUseCase
  tenantService: TenantService
  requireAuth: (c: import('hono').Context, next: import('hono').Next) => Promise<Response | void>
}

type GuardFn = (workspaceId: string, userOrgId: string) => Promise<void>

export function publishWorkspace(deps: WorkspacePublishRouteDeps, guard: GuardFn) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const user = c.get('user') as AuthUser
    try {
      await guard(c.req.param('id')!, user.org_id)
      await deps.publishWorkspaceUseCase.execute(c.req.param('id')!, true)
      return c.json({ status: 'ok' })
    } catch (err) {
      if (err instanceof NotFoundError) return c.json({ error: 'not_found' }, 404)
      throw err
    }
  }
}

export function unpublishWorkspace(deps: WorkspacePublishRouteDeps, guard: GuardFn) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const user = c.get('user') as AuthUser
    try {
      await guard(c.req.param('id')!, user.org_id)
      await deps.publishWorkspaceUseCase.execute(c.req.param('id')!, false)
      return c.json({ status: 'ok' })
    } catch (err) {
      if (err instanceof NotFoundError) return c.json({ error: 'not_found' }, 404)
      throw err
    }
  }
}
