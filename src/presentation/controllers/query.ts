import type { ExecuteQueryUseCase } from '../../application/query/ExecuteQueryUseCase.js'
import { parseBody } from '../middleware/validate.js'
import { type AuthUser, type AuthEnv } from '../middleware/auth.js'
import type { WorkspaceRepository } from '../../domain/workspace/repository.js'
import type { TenantService } from '../../application/ports/TenantService.js'
import { handleDomainError } from '../helpers/handleDomainError.js'
import type { GuardFn } from '../helpers/guardWorkspace.js'
import { queryBodySchema } from '../validators/query.js'

export interface QueryRouteDeps {
  executeQueryUseCase: ExecuteQueryUseCase
  workspaceRepo: WorkspaceRepository
  tenantService: TenantService
  requireAuth: (c: import('hono').Context, next: import('hono').Next) => Promise<Response | void>
}

export function executeQuery(deps: QueryRouteDeps, guard: GuardFn) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const parsed = await parseBody(c, queryBodySchema)
    if (!parsed.success) return parsed.response

    const user = c.get('user') as AuthUser
    const wsId = c.req.param('id')!
    await guard(wsId, user.org_id)

    try {
      const ctx = parsed.data.consumer_context
      const result = await deps.executeQueryUseCase.execute(wsId, parsed.data.query, {
        consumerType: parsed.data.consumer_type || 'api',
        channel: ctx?.channel,
        userId: ctx?.userId || user?.id,
        userName: ctx?.userName || user?.name,
        sessionId: parsed.data.session_id,
      })

      return c.json({
        answer: result.answer,
        tools_called: result.toolsCalled,
        connections_hit: result.connectionsHit,
        tokens: { input: result.tokensInput, output: result.tokensOutput },
        cost_usd: result.costUsd,
        duration_ms: result.durationMs,
        error: result.error,
        conversation_id: result.conversationId,
        session_id: result.sessionId,
      })
    } catch (err) {
      return handleDomainError(c, err)
    }
  }
}
