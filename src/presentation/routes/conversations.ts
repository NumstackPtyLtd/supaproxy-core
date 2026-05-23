import { Hono } from 'hono'
import type { AuthEnv } from '../middleware/auth.js'
import { createGuardWorkspace } from '../helpers/guardWorkspace.js'
import {
  type ConversationRouteDeps,
  listConversations, getConversationDetail, closeConversation,
} from '../controllers/conversations.js'

export type { ConversationRouteDeps }

export function createConversationRoutes(deps: ConversationRouteDeps) {
  const guardWorkspace = createGuardWorkspace(deps.workspaceRepo, deps.tenantService)

  const conversations = new Hono<AuthEnv>()

  conversations.use('/api/workspaces/*/conversations*', deps.requireAuth)

  conversations.get('/api/workspaces/:id/conversations', listConversations(deps, guardWorkspace))
  conversations.get('/api/workspaces/:id/conversations/:cid', getConversationDetail(deps, guardWorkspace))
  conversations.post('/api/workspaces/:id/conversations/:cid/close', closeConversation(deps, guardWorkspace))

  return conversations
}
