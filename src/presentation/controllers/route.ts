import type { RouteMessageUseCase } from '../../application/routing/RouteMessageUseCase.js'
import { parseBody } from '../middleware/validate.js'
import { type AuthUser, type AuthEnv } from '../middleware/auth.js'
import { NotFoundError } from '../../domain/shared/errors.js'
import { routeBodySchema } from '../validators/route.js'

export interface RouteRouteDeps {
  routeMessageUseCase: RouteMessageUseCase
  requireAuth: (c: import('hono').Context, next: import('hono').Next) => Promise<Response | void>
}

export function routeMessage(deps: RouteRouteDeps) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const parsed = await parseBody(c, routeBodySchema)
    if (!parsed.success) return parsed.response

    const user = c.get('user') as AuthUser

    try {
      const result = await deps.routeMessageUseCase.execute({
        orgId: user.org_id,
        query: parsed.data.query,
        consumerType: 'dashboard',
        entryPoint: 'test',
        userId: user.id,
        userName: user.name,
      })

      return c.json({
        answer: result.answer,
        conversation_id: result.conversationId,
        workspace_id: result.workspaceId,
        routed: result.routed,
        routed_to: result.routedTo || null,
      })
    } catch (err) {
      if (err instanceof NotFoundError) return c.json({ error: 'not_found' }, 404)
      throw err
    }
  }
}
