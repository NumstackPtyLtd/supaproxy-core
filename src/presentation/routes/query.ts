import { Hono } from 'hono'
import { z } from 'zod'
import type { ExecuteQueryUseCase } from '../../application/query/ExecuteQueryUseCase.js'
import { parseBody } from '../middleware/validate.js'
import { MAX_QUERY_LENGTH, MAX_HISTORY_ITEMS } from '../../defaults.js'
import { type AuthUser, type AuthEnv } from '../middleware/auth.js'
import type { WorkspaceRepository } from '../../domain/workspace/repository.js'
import type { TenantService } from '../../application/ports/TenantService.js'
import { NotFoundError } from '../../domain/shared/errors.js'

const queryBodySchema = z.object({
  query: z.string().min(1).max(MAX_QUERY_LENGTH),
  session_id: z.string().max(255).optional(),
  consumer_type: z.string().max(50).optional(),
  consumer_context: z.object({
    channel: z.string().max(255).optional(),
    userId: z.string().max(255).optional(),
    userName: z.string().max(255).optional(),
    threadId: z.string().max(255).optional(),
  }).optional(),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).max(MAX_HISTORY_ITEMS).optional(),
})

interface QueryRouteDeps {
  executeQueryUseCase: ExecuteQueryUseCase
  workspaceRepo: WorkspaceRepository
  tenantService: TenantService
  requireAuth: (c: import('hono').Context, next: import('hono').Next) => Promise<Response | void>
}

export function createQueryRoutes(deps: QueryRouteDeps) {
  async function guardWorkspace(workspaceId: string, userOrgId: string) {
    const ws = await deps.workspaceRepo.findById(workspaceId)
    deps.tenantService.verifyWorkspaceAccess(ws?.org_id ?? null, userOrgId)
  }

  const query = new Hono<AuthEnv>()

  query.use('/api/workspaces/*/query', deps.requireAuth)

  query.post('/api/workspaces/:id/query', async (c) => {
    const parsed = await parseBody(c, queryBodySchema)
    if (!parsed.success) return parsed.response

    const user = c.get('user') as AuthUser
    const wsId = c.req.param('id')
    await guardWorkspace(wsId, user.org_id)

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
      if (err instanceof NotFoundError) return c.json({ error: 'not_found' }, 404)
      throw err
    }
  })

  return query
}
