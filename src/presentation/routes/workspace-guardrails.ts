import { Hono } from 'hono'
import type { ListWorkspaceGuardrailsUseCase } from '../../application/workspace/ListWorkspaceGuardrailsUseCase.js'
import type { EnableGuardrailUseCase } from '../../application/workspace/EnableGuardrailUseCase.js'
import type { DisableGuardrailUseCase } from '../../application/workspace/DisableGuardrailUseCase.js'
import { type AuthUser, type AuthEnv } from '../middleware/auth.js'
import type { GuardFn } from '../helpers/guardWorkspace.js'

interface WorkspaceGuardrailRouteDeps {
  listWorkspaceGuardrailsUseCase: ListWorkspaceGuardrailsUseCase
  enableGuardrailUseCase: EnableGuardrailUseCase
  disableGuardrailUseCase: DisableGuardrailUseCase
  requireAuth: (c: import('hono').Context, next: import('hono').Next) => Promise<Response | void>
}

function listGuardrails(deps: WorkspaceGuardrailRouteDeps, guard: GuardFn) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const user = c.get('user') as AuthUser
    const workspaceId = c.req.param('id')!
    await guard(workspaceId, user.org_id)

    const guardrails = await deps.listWorkspaceGuardrailsUseCase.execute(workspaceId, user.org_id)
    return c.json({ guardrails })
  }
}

function enableGuardrail(deps: WorkspaceGuardrailRouteDeps, guard: GuardFn) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const user = c.get('user') as AuthUser
    const workspaceId = c.req.param('id')!
    const guardrailId = c.req.param('guardrailId')!
    await guard(workspaceId, user.org_id)

    const body = await c.req.json().catch(() => ({})) as { config?: string }
    await deps.enableGuardrailUseCase.execute(workspaceId, guardrailId, body.config)

    return c.json({ ok: true })
  }
}

function disableGuardrail(deps: WorkspaceGuardrailRouteDeps, guard: GuardFn) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const user = c.get('user') as AuthUser
    const workspaceId = c.req.param('id')!
    const guardrailId = c.req.param('guardrailId')!
    await guard(workspaceId, user.org_id)

    await deps.disableGuardrailUseCase.execute(workspaceId, guardrailId)

    return c.json({ ok: true })
  }
}

export function createWorkspaceGuardrailRoutes(deps: WorkspaceGuardrailRouteDeps, guardWorkspace: GuardFn) {
  const app = new Hono<AuthEnv>()

  app.get('/api/workspaces/:id/guardrails', listGuardrails(deps, guardWorkspace))
  app.post('/api/workspaces/:id/guardrails/:guardrailId/enable', enableGuardrail(deps, guardWorkspace))
  app.post('/api/workspaces/:id/guardrails/:guardrailId/disable', disableGuardrail(deps, guardWorkspace))

  return app
}
