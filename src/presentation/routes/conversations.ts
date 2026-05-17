import { Hono } from 'hono'
import pino from 'pino'
import type { ListConversationsUseCase } from '../../application/conversation/ListConversationsUseCase.js'
import type { GetConversationDetailUseCase } from '../../application/conversation/GetConversationDetailUseCase.js'
import type { CloseConversationUseCase } from '../../application/conversation/CloseConversationUseCase.js'
import { type AuthUser, type AuthEnv } from '../middleware/auth.js'
import type { WorkspaceRepository } from '../../domain/workspace/repository.js'
import type { TenantService } from '../../application/ports/TenantService.js'
import { NotFoundError } from '../../domain/shared/errors.js'
import { DEFAULT_PAGINATION_LIMIT } from '../../defaults.js'

const log = pino({ name: 'routes/conversations' })

interface ConversationRouteDeps {
  listConversationsUseCase: ListConversationsUseCase
  getConversationDetailUseCase: GetConversationDetailUseCase
  closeConversationUseCase: CloseConversationUseCase
  workspaceRepo: WorkspaceRepository
  tenantService: TenantService
  requireAuth: (c: import('hono').Context, next: import('hono').Next) => Promise<Response | void>
}

export function createConversationRoutes(deps: ConversationRouteDeps) {
  async function guardWorkspace(workspaceId: string, userOrgId: string) {
    const ws = await deps.workspaceRepo.findById(workspaceId)
    deps.tenantService.verifyWorkspaceAccess(ws?.org_id ?? null, userOrgId)
  }

  const conversations = new Hono<AuthEnv>()

  conversations.use('/api/workspaces/*/conversations*', deps.requireAuth)

  conversations.get('/api/workspaces/:id/conversations', async (c) => {
    const user = c.get('user') as AuthUser
    const wsId = c.req.param('id')
    await guardWorkspace(wsId, user.org_id)
    const limit = parseInt(c.req.query('limit') || String(DEFAULT_PAGINATION_LIMIT))
    const offset = parseInt(c.req.query('offset') || '0')
    const filters = {
      status: c.req.query('status'),
      category: c.req.query('category'),
      resolution: c.req.query('resolution'),
      consumer: c.req.query('consumer'),
    }

    const result = await deps.listConversationsUseCase.execute(wsId, filters, limit, offset)
    return c.json(result)
  })

  conversations.get('/api/workspaces/:id/conversations/:cid', async (c) => {
    const user = c.get('user') as AuthUser
    await guardWorkspace(c.req.param('id'), user.org_id)
    try {
      const result = await deps.getConversationDetailUseCase.execute(c.req.param('cid'))
      return c.json(result)
    } catch (err) {
      if (err instanceof NotFoundError) return c.json({ error: 'not_found' }, 404)
      throw err
    }
  })

  conversations.post('/api/workspaces/:id/conversations/:cid/close', async (c) => {
    const user = c.get('user') as AuthUser
    await guardWorkspace(c.req.param('id'), user.org_id)
    try {
      await deps.closeConversationUseCase.execute(c.req.param('cid'))
      log.info({ conversationId: c.req.param('cid') }, 'Conversation closed manually, analysis queued')
      return c.json({ status: 'closed', message: 'closed' })
    } catch (err) {
      if (err instanceof NotFoundError) return c.json({ error: 'not_found' }, 404)
      throw err
    }
  })

  return conversations
}
