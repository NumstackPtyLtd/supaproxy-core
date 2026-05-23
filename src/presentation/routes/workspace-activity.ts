import { Hono } from 'hono'
import type { GetActivityUseCase } from '../../application/workspace/GetActivityUseCase.js'
import type { GetComplianceUseCase } from '../../application/workspace/GetComplianceUseCase.js'
import type { GuardrailEventRepository } from '../../domain/guardrail/repository.js'
import type { TenantService } from '../../application/ports/TenantService.js'
import { type AuthUser, type AuthEnv } from '../middleware/auth.js'
import { DEFAULT_PAGINATION_LIMIT, MAX_PAGINATION_LIMIT } from '../../defaults.js'

interface WorkspaceActivityRouteDeps {
  getActivityUseCase: GetActivityUseCase
  getComplianceUseCase: GetComplianceUseCase
  guardrailEventRepo: GuardrailEventRepository
  tenantService: TenantService
  requireAuth: (c: import('hono').Context, next: import('hono').Next) => Promise<Response | void>
}

type GuardFn = (workspaceId: string, userOrgId: string) => Promise<void>

function getActivity(deps: WorkspaceActivityRouteDeps, guard: GuardFn) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const user = c.get('user') as AuthUser
    await guard(c.req.param('id')!, user.org_id)
    const limit = parseInt(c.req.query('limit') || String(DEFAULT_PAGINATION_LIMIT))
    const offset = parseInt(c.req.query('offset') || '0')
    const result = await deps.getActivityUseCase.execute(c.req.param('id')!, limit, offset)
    return c.json({ activity: result.rows, total: result.total })
  }
}

function getCompliance(deps: WorkspaceActivityRouteDeps, guard: GuardFn) {
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

function updateGuardrailEventStatus(deps: WorkspaceActivityRouteDeps, guard: GuardFn) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const user = c.get('user') as AuthUser
    await guard(c.req.param('id')!, user.org_id)
    const body = await c.req.json<{ status: string }>()
    if (body.status !== 'open' && body.status !== 'flagged' && body.status !== 'dismissed') {
      return c.json({ error: 'invalid_status' }, 400)
    }
    await deps.guardrailEventRepo.updateStatus(c.req.param('eventId')!, body.status)
    return c.json({ status: body.status })
  }
}

export function createWorkspaceActivityRoutes(deps: WorkspaceActivityRouteDeps, guardWorkspace: GuardFn) {
  const app = new Hono<AuthEnv>()

  app.get('/api/workspaces/:id/activity', getActivity(deps, guardWorkspace))
  app.get('/api/workspaces/:id/compliance', getCompliance(deps, guardWorkspace))
  app.patch('/api/workspaces/:id/guardrail-events/:eventId/status', updateGuardrailEventStatus(deps, guardWorkspace))

  return app
}
