import { Hono } from 'hono'
import type { AuthEnv } from '../middleware/auth.js'
import type { GuardFn } from '../helpers/guardWorkspace.js'
import {
  type WorkspaceGuardrailRouteDeps,
  listGuardrails, enableGuardrail, disableGuardrail,
} from '../controllers/workspace-guardrails.js'

export type { WorkspaceGuardrailRouteDeps }

export function createWorkspaceGuardrailRoutes(deps: WorkspaceGuardrailRouteDeps, guardWorkspace: GuardFn) {
  const app = new Hono<AuthEnv>()

  app.get('/api/workspaces/:id/guardrails', listGuardrails(deps, guardWorkspace))
  app.post('/api/workspaces/:id/guardrails/:guardrailId/enable', enableGuardrail(deps, guardWorkspace))
  app.post('/api/workspaces/:id/guardrails/:guardrailId/disable', disableGuardrail(deps, guardWorkspace))

  return app
}
