import { Hono } from 'hono'
import type { AuthEnv } from '../middleware/auth.js'
import type { GuardFn } from '../helpers/guardWorkspace.js'
import {
  type WorkspaceKnowledgeRouteDeps,
  listKnowledge, createKnowledgeSource, deleteKnowledgeSource,
} from '../controllers/workspace-knowledge.js'

export type { WorkspaceKnowledgeRouteDeps }

export function createWorkspaceKnowledgeRoutes(deps: WorkspaceKnowledgeRouteDeps, guardWorkspace: GuardFn) {
  const app = new Hono<AuthEnv>()

  app.get('/api/workspaces/:id/knowledge', listKnowledge(deps, guardWorkspace))
  app.post('/api/workspaces/:id/knowledge', createKnowledgeSource(deps, guardWorkspace))
  app.delete('/api/workspaces/:id/knowledge/:sourceId', deleteKnowledgeSource(deps, guardWorkspace))

  return app
}
