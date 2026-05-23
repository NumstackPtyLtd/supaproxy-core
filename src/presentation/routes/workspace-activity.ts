import { Hono } from 'hono'
import type { AuthEnv } from '../middleware/auth.js'
import type { GuardFn } from '../helpers/guardWorkspace.js'
import {
  type WorkspaceActivityRouteDeps,
  getActivity, getCompliance, updateGuardrailEventStatus,
} from '../controllers/workspace-activity.js'

export type { WorkspaceActivityRouteDeps }

export function createWorkspaceActivityRoutes(deps: WorkspaceActivityRouteDeps, guardWorkspace: GuardFn) {
  const app = new Hono<AuthEnv>()

  app.get('/api/workspaces/:id/activity', getActivity(deps, guardWorkspace))
  app.get('/api/workspaces/:id/compliance', getCompliance(deps, guardWorkspace))
  app.patch('/api/workspaces/:id/guardrail-events/:eventId/status', updateGuardrailEventStatus(deps, guardWorkspace))

  return app
}
