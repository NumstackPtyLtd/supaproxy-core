import { Hono } from 'hono'
import type { AuthEnv } from '../middleware/auth.js'
import {
  type WorkspacePublishRouteDeps,
  publishWorkspace, unpublishWorkspace,
} from '../controllers/workspace-publish.js'

type GuardFn = (workspaceId: string, userOrgId: string) => Promise<void>

export type { WorkspacePublishRouteDeps }

export function createWorkspacePublishRoutes(deps: WorkspacePublishRouteDeps, guardWorkspace: GuardFn) {
  const app = new Hono<AuthEnv>()

  app.post('/api/workspaces/:id/publish', publishWorkspace(deps, guardWorkspace))
  app.post('/api/workspaces/:id/unpublish', unpublishWorkspace(deps, guardWorkspace))

  return app
}
