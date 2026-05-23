import pino from 'pino'
import { ConversationStatus } from '../../domain/conversation/ConversationStatus.js'
import type { ListConversationsUseCase } from '../../application/conversation/ListConversationsUseCase.js'
import type { GetConversationDetailUseCase } from '../../application/conversation/GetConversationDetailUseCase.js'
import type { CloseConversationUseCase } from '../../application/conversation/CloseConversationUseCase.js'
import type { AuthUser, AuthEnv } from '../middleware/auth.js'
import { handleDomainError } from '../helpers/handleDomainError.js'
import type { GuardFn } from '../helpers/guardWorkspace.js'
import { parsePagination } from '../helpers/parsePagination.js'
import type { WorkspaceRepository } from '../../domain/workspace/repository.js'
import type { TenantService } from '../../application/ports/TenantService.js'

const log = pino({ name: 'routes/conversations' })

export interface ConversationRouteDeps {
  listConversationsUseCase: ListConversationsUseCase
  getConversationDetailUseCase: GetConversationDetailUseCase
  closeConversationUseCase: CloseConversationUseCase
  workspaceRepo: WorkspaceRepository
  tenantService: TenantService
  requireAuth: (c: import('hono').Context, next: import('hono').Next) => Promise<Response | void>
}

export function listConversations(deps: ConversationRouteDeps, guard: GuardFn) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const user = c.get('user') as AuthUser
    const wsId = c.req.param('id')!
    await guard(wsId, user.org_id)
    const { limit, offset } = parsePagination(c)
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

export function getConversationDetail(deps: ConversationRouteDeps, guard: GuardFn) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const user = c.get('user') as AuthUser
    await guard(c.req.param('id')!, user.org_id)
    try {
      const result = await deps.getConversationDetailUseCase.execute(c.req.param('cid')!)
      return c.json(result)
    } catch (err) {
      return handleDomainError(c, err)
    }
  }
}

export function closeConversation(deps: ConversationRouteDeps, guard: GuardFn) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const user = c.get('user') as AuthUser
    await guard(c.req.param('id')!, user.org_id)
    try {
      await deps.closeConversationUseCase.execute(c.req.param('cid')!)
      log.info({ conversationId: c.req.param('cid')! }, 'Conversation closed manually, analysis queued')
      return c.json({ status: ConversationStatus.CLOSED, message: ConversationStatus.CLOSED })
    } catch (err) {
      return handleDomainError(c, err)
    }
  }
}
