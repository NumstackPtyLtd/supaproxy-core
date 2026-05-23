import { Hono } from 'hono'
import type { AuthEnv } from '../middleware/auth.js'
import type { GuardFn } from '../helpers/guardWorkspace.js'
import {
  type WorkspaceCrudRouteDeps,
  listTeams, createWorkspace, listWorkspaces,
  getWorkspaceSummary, getWorkspaceDetail, updateWorkspace,
  getDashboard, deleteWorkspace,
} from '../controllers/workspace-crud.js'

export type { WorkspaceCrudRouteDeps }

export function createWorkspaceCrudRoutes(deps: WorkspaceCrudRouteDeps, guardWorkspace: GuardFn) {
  const app = new Hono<AuthEnv>()

  app.get('/api/teams', listTeams(deps))
  app.post('/api/workspaces', createWorkspace(deps))
  app.get('/api/workspaces', listWorkspaces(deps))
  app.get('/api/workspaces/:id/summary', getWorkspaceSummary(deps, guardWorkspace))
  app.get('/api/workspaces/:id', getWorkspaceDetail(deps, guardWorkspace))
  app.put('/api/workspaces/:id', updateWorkspace(deps, guardWorkspace))
  app.get('/api/workspaces/:id/dashboard', getDashboard(deps, guardWorkspace))
  app.delete('/api/workspaces/:id', deleteWorkspace(deps, guardWorkspace))

  return app
}
