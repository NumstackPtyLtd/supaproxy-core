import { Hono } from 'hono'
import type { PublishWorkspaceUseCase } from '../../application/workspace/PublishWorkspaceUseCase.js'
import type { TenantService } from '../../application/ports/TenantService.js'
import { type AuthUser, type AuthEnv } from '../middleware/auth.js'
import { NotFoundError } from '../../domain/shared/errors.js'

interface WorkspacePublishRouteDeps {
  publishWorkspaceUseCase: PublishWorkspaceUseCase
  tenantService: TenantService
  requireAuth: (c: import('hono').Context, next: import('hono').Next) => Promise<Response | void>
}

export function createWorkspacePublishRoutes(deps: WorkspacePublishRouteDeps, guardWorkspace: (workspaceId: string, userOrgId: string) => Promise<void>) {
  const app = new Hono<AuthEnv>()

  app.post('/api/workspaces/:id/publish', async (c) => {
    const user = c.get('user') as AuthUser
    try {
      await guardWorkspace(c.req.param('id'), user.org_id)
      await deps.publishWorkspaceUseCase.execute(c.req.param('id'), true)
      return c.json({ status: 'ok' })
    } catch (err) {
      if (err instanceof NotFoundError) return c.json({ error: 'not_found' }, 404)
      throw err
    }
  })

  app.post('/api/workspaces/:id/unpublish', async (c) => {
    const user = c.get('user') as AuthUser
    try {
      await guardWorkspace(c.req.param('id'), user.org_id)
      await deps.publishWorkspaceUseCase.execute(c.req.param('id'), false)
      return c.json({ status: 'ok' })
    } catch (err) {
      if (err instanceof NotFoundError) return c.json({ error: 'not_found' }, 404)
      throw err
    }
  })

  return app
}
