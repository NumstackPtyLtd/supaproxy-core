import type { GetActivityUseCase } from '../../application/workspace/GetActivityUseCase.js'
import type { GetComplianceUseCase } from '../../application/workspace/GetComplianceUseCase.js'
import type { UpdateGuardrailEventStatusUseCase } from '../../application/guardrail/UpdateGuardrailEventStatusUseCase.js'
import { type AuthUser, type AuthEnv } from '../middleware/auth.js'
import type { GuardFn } from '../helpers/guardWorkspace.js'
import { parsePagination } from '../helpers/parsePagination.js'
import { handleDomainError } from '../helpers/handleDomainError.js'
import { DEFAULT_PAGINATION_LIMIT, MAX_PAGINATION_LIMIT } from '../../defaults.js'

export interface WorkspaceActivityRouteDeps {
  getActivityUseCase: GetActivityUseCase
  getComplianceUseCase: GetComplianceUseCase
  updateGuardrailEventStatusUseCase: UpdateGuardrailEventStatusUseCase
  requireAuth: (c: import('hono').Context, next: import('hono').Next) => Promise<Response | void>
}

export function getActivity(deps: WorkspaceActivityRouteDeps, guard: GuardFn) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const user = c.get('user') as AuthUser
    await guard(c.req.param('id')!, user.org_id)
    const { limit, offset } = parsePagination(c)
    const result = await deps.getActivityUseCase.execute(c.req.param('id')!, limit, offset)
    return c.json({ activity: result.rows, total: result.total })
  }
}

export function getCompliance(deps: WorkspaceActivityRouteDeps, guard: GuardFn) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const user = c.get('user') as AuthUser
    await guard(c.req.param('id')!, user.org_id)

    const eventType = c.req.query('event_type')
    const eventStatus = c.req.query('status')
    const search = c.req.query('search')
    const page = c.req.query('page')
    const limit = c.req.query('limit')

    const hasFilter = eventType || eventStatus || search || page || limit
    const validEventType = eventType === 'execution_blocked' || eventType === 'retrieval_stripped' ? eventType as 'execution_blocked' | 'retrieval_stripped' : undefined
    const validStatus = eventStatus === 'open' || eventStatus === 'flagged' || eventStatus === 'dismissed' ? eventStatus as 'open' | 'flagged' | 'dismissed' : undefined
    const parsedLimit = limit ? Math.min(Math.max(parseInt(limit, 10) || DEFAULT_PAGINATION_LIMIT, 1), MAX_PAGINATION_LIMIT) : DEFAULT_PAGINATION_LIMIT
    const eventFilter = hasFilter ? {
      event_type: validEventType,
      status: validStatus,
      search: search || undefined,
      limit: parsedLimit,
      offset: page ? (Math.max(parseInt(page, 10) || 0, 0)) * parsedLimit : 0,
    } : undefined

    const result = await deps.getComplianceUseCase.execute(c.req.param('id')!, eventFilter)
    return c.json(result)
  }
}

export function updateGuardrailEventStatus(deps: WorkspaceActivityRouteDeps, guard: GuardFn) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const user = c.get('user') as AuthUser
    await guard(c.req.param('id')!, user.org_id)
    const body = await c.req.json<{ status: string }>()

    try {
      const status = await deps.updateGuardrailEventStatusUseCase.execute(c.req.param('eventId')!, body.status)
      return c.json({ status })
    } catch (err) {
      return handleDomainError(c, err)
    }
  }
}
