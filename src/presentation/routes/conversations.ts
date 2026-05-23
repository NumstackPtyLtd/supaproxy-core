import { Hono } from 'hono'
import pino from 'pino'
import { ConversationStatus } from '../../domain/conversation/ConversationStatus.js'
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

type GuardFn = (workspaceId: string, userOrgId: string) => Promise<void>

function listConversations(deps: ConversationRouteDeps, guard: GuardFn) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const user = c.get('user') as AuthUser
    const wsId = c.req.param('id')!
    await guard(wsId, user.org_id)
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
  }
}

function getConversationDetail(deps: ConversationRouteDeps, guard: GuardFn) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const user = c.get('user') as AuthUser
    await guard(c.req.param('id')!, user.org_id)
    try {
      const result = await deps.getConversationDetailUseCase.execute(c.req.param('cid')!)
      return c.json(result)
    } catch (err) {
      if (err instanceof NotFoundError) return c.json({ error: 'not_found' }, 404)
      throw err
    }
  }
}

function closeConversation(deps: ConversationRouteDeps, guard: GuardFn) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const user = c.get('user') as AuthUser
    await guard(c.req.param('id')!, user.org_id)
    try {
      await deps.closeConversationUseCase.execute(c.req.param('cid')!)
      log.info({ conversationId: c.req.param('cid')! }, 'Conversation closed manually, analysis queued')
      return c.json({ status: ConversationStatus.CLOSED, message: ConversationStatus.CLOSED })
    } catch (err) {
      if (err instanceof NotFoundError) return c.json({ error: 'not_found' }, 404)
      throw err
    }
  }
}

export function createConversationRoutes(deps: ConversationRouteDeps) {
  function guardWorkspace(workspaceId: string, userOrgId: string) {
    return deps.workspaceRepo.findById(workspaceId).then(ws => {
      deps.tenantService.verifyWorkspaceAccess(ws?.org_id ?? null, userOrgId)
    })
  }

  const conversations = new Hono<AuthEnv>()

  conversations.use('/api/workspaces/*/conversations*', deps.requireAuth)

  conversations.get('/api/workspaces/:id/conversations', listConversations(deps, guardWorkspace))
  conversations.get('/api/workspaces/:id/conversations/:cid', getConversationDetail(deps, guardWorkspace))
  conversations.post('/api/workspaces/:id/conversations/:cid/close', closeConversation(deps, guardWorkspace))

  return conversations
}
