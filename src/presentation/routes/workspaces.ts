import { Hono } from 'hono'
import { z } from 'zod'
import pino from 'pino'
import type { CreateWorkspaceUseCase } from '../../application/workspace/CreateWorkspaceUseCase.js'
import type { UpdateWorkspaceUseCase } from '../../application/workspace/UpdateWorkspaceUseCase.js'
import type { GetWorkspaceDetailUseCase } from '../../application/workspace/GetWorkspaceDetailUseCase.js'
import type { ListWorkspacesUseCase } from '../../application/workspace/ListWorkspacesUseCase.js'
import type { GetWorkspaceSummaryUseCase } from '../../application/workspace/GetWorkspaceSummaryUseCase.js'
import type { GetDashboardUseCase } from '../../application/workspace/GetDashboardUseCase.js'
import type { GetActivityUseCase } from '../../application/workspace/GetActivityUseCase.js'
import type { DeleteConnectionUseCase } from '../../application/workspace/DeleteConnectionUseCase.js'
import type { GetConnectionsUseCase } from '../../application/workspace/GetConnectionsUseCase.js'
import type { GetKnowledgeUseCase } from '../../application/workspace/GetKnowledgeUseCase.js'
import type { GetComplianceUseCase } from '../../application/workspace/GetComplianceUseCase.js'
import type { DeleteWorkspaceUseCase } from '../../application/workspace/DeleteWorkspaceUseCase.js'
import type { PublishWorkspaceUseCase } from '../../application/workspace/PublishWorkspaceUseCase.js'
import type { GuardrailEventRepository } from '../../domain/guardrail/repository.js'
import type { GuardrailPolicyRepository } from '../../domain/guardrail/policyRepository.js'
import type { OrganisationRepository } from '../../domain/organisation/repository.js'
import type { WorkspaceRepository } from '../../domain/workspace/repository.js'
import type { TenantService } from '../../application/ports/TenantService.js'
import { parseBody } from '../middleware/validate.js'
import { type AuthUser, type AuthEnv } from '../middleware/auth.js'
import { NotFoundError, ConflictError, ValidationError } from '../../domain/shared/errors.js'
import { MAX_WORKSPACE_NAME_LENGTH, MAX_TIMEOUT_MINUTES, MAX_SYSTEM_PROMPT_LENGTH } from '../../defaults.js'

const log = pino({ name: 'routes/workspaces' })

const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(MAX_WORKSPACE_NAME_LENGTH),
  model: z.string().min(1).max(100),
  team_id: z.string().max(MAX_WORKSPACE_NAME_LENGTH).optional(),
  team_name: z.string().max(MAX_WORKSPACE_NAME_LENGTH).optional(),
  system_prompt: z.string().max(MAX_SYSTEM_PROMPT_LENGTH).optional(),
  org_id: z.string().max(MAX_WORKSPACE_NAME_LENGTH).optional(),
}).refine((data) => data.team_id || data.team_name, {
  path: ['team_id'],
})

const updateWorkspaceSchema = z.object({
  name: z.string().min(1).max(MAX_WORKSPACE_NAME_LENGTH).optional(),
  model: z.string().min(1).max(MAX_WORKSPACE_NAME_LENGTH).optional(),
  system_prompt: z.string().max(MAX_SYSTEM_PROMPT_LENGTH).optional(),
  cold_timeout_minutes: z.number().int().min(1).max(MAX_TIMEOUT_MINUTES).nullable().optional(),
  close_timeout_minutes: z.number().int().min(1).max(MAX_TIMEOUT_MINUTES).nullable().optional(),
})

interface WorkspaceRouteDeps {
  createWorkspaceUseCase: CreateWorkspaceUseCase
  updateWorkspaceUseCase: UpdateWorkspaceUseCase
  getWorkspaceDetailUseCase: GetWorkspaceDetailUseCase
  listWorkspacesUseCase: ListWorkspacesUseCase
  getWorkspaceSummaryUseCase: GetWorkspaceSummaryUseCase
  getDashboardUseCase: GetDashboardUseCase
  getActivityUseCase: GetActivityUseCase
  deleteConnectionUseCase: DeleteConnectionUseCase
  getConnectionsUseCase: GetConnectionsUseCase
  getKnowledgeUseCase: GetKnowledgeUseCase
  getComplianceUseCase: GetComplianceUseCase
  deleteWorkspaceUseCase: DeleteWorkspaceUseCase
  publishWorkspaceUseCase: PublishWorkspaceUseCase
  guardrailEventRepo: GuardrailEventRepository
  guardrailPolicyRepo: GuardrailPolicyRepository
  listAvailableGuardrails: (orgId: string) => Promise<Array<{ id: string; name: string; description: string; stage: string; source: 'core' | 'marketplace'; configSchema: { fields: Array<{ name: string; label: string; type: string; required?: boolean; placeholder?: string; helpText?: string; options?: Array<{ value: string; label: string }>; defaultValue?: string | boolean | number }> } }>>
  orgRepo: OrganisationRepository
  workspaceRepo: WorkspaceRepository
  tenantService: TenantService
  requireAuth: (c: import('hono').Context, next: import('hono').Next) => Promise<Response | void>
}

export function createWorkspaceRoutes(deps: WorkspaceRouteDeps) {
  const workspaces = new Hono<AuthEnv>()

  workspaces.use('/api/workspaces/*', deps.requireAuth)
  workspaces.use('/api/workspaces', deps.requireAuth)
  workspaces.use('/api/teams', deps.requireAuth)
  workspaces.use('/api/connections/*', deps.requireAuth)

  workspaces.get('/api/teams', async (c) => {
    const user = c.get('user') as AuthUser
    const teams = await deps.orgRepo.listTeams(user.org_id)
    return c.json({ teams })
  })

  workspaces.post('/api/workspaces', async (c) => {
    const result = await parseBody(c, createWorkspaceSchema)
    if (!result.success) return result.response
    const user = c.get('user') as AuthUser

    try {
      const ws = await deps.createWorkspaceUseCase.execute({
        name: result.data.name,
        model: result.data.model,
        teamId: result.data.team_id,
        teamName: result.data.team_name,
        systemPrompt: result.data.system_prompt,
        orgId: user.org_id,
      })
      log.info({ workspace: ws.id, name: ws.name }, 'Workspace created')
      return c.json(ws)
    } catch (err) {
      if (err instanceof ConflictError) return c.json({ error: 'conflict' }, 400)
      throw err
    }
  })

  // Helper: verify workspace belongs to user's org (delegates to tenant service)
  async function guardWorkspace(workspaceId: string, userOrgId: string) {
    const ws = await deps.workspaceRepo.findById(workspaceId)
    deps.tenantService.verifyWorkspaceAccess(ws?.org_id ?? null, userOrgId)
  }

  workspaces.get('/api/workspaces', async (c) => {
    const user = c.get('user') as AuthUser
    const orgScope = deps.tenantService.scopeWorkspaceList(user.org_id)
    const rows = await deps.listWorkspacesUseCase.execute(orgScope)
    return c.json({ workspaces: rows })
  })

  workspaces.get('/api/workspaces/:id/summary', async (c) => {
    const user = c.get('user') as AuthUser
    try {
      await guardWorkspace(c.req.param('id'), user.org_id)
      const workspace = await deps.getWorkspaceSummaryUseCase.execute(c.req.param('id'))
      return c.json({ workspace })
    } catch (err) {
      if (err instanceof NotFoundError) return c.json({ error: 'not_found' }, 404)
      throw err
    }
  })

  workspaces.delete('/api/connections/:id', async (c) => {
    await deps.deleteConnectionUseCase.execute(c.req.param('id'))
    return c.json({ status: 'ok' })
  })

  workspaces.get('/api/workspaces/:id/connections', async (c) => {
    const user = c.get('user') as AuthUser
    await guardWorkspace(c.req.param('id'), user.org_id)
    const result = await deps.getConnectionsUseCase.execute(c.req.param('id'))
    return c.json(result)
  })

  workspaces.get('/api/workspaces/:id/consumers', async (c) => {
    const user = c.get('user') as AuthUser
    await guardWorkspace(c.req.param('id'), user.org_id)
    const consumers = await deps.workspaceRepo.findConsumers(c.req.param('id'))
    return c.json({ consumers })
  })

  workspaces.get('/api/workspaces/:id/knowledge', async (c) => {
    const user = c.get('user') as AuthUser
    await guardWorkspace(c.req.param('id'), user.org_id)
    const result = await deps.getKnowledgeUseCase.execute(c.req.param('id'))
    return c.json(result)
  })

  workspaces.get('/api/workspaces/:id/compliance', async (c) => {
    const user = c.get('user') as AuthUser
    await guardWorkspace(c.req.param('id'), user.org_id)

    const eventType = c.req.query('event_type')
    const eventStatus = c.req.query('status')
    const search = c.req.query('search')
    const page = c.req.query('page')
    const limit = c.req.query('limit')

    const hasFilter = eventType || eventStatus || search || page || limit
    const validEventType = eventType === 'execution_blocked' || eventType === 'retrieval_stripped' ? eventType as 'execution_blocked' | 'retrieval_stripped' : undefined
    const validStatus = eventStatus === 'open' || eventStatus === 'flagged' || eventStatus === 'dismissed' ? eventStatus as 'open' | 'flagged' | 'dismissed' : undefined
    const eventFilter = hasFilter ? {
      event_type: validEventType,
      status: validStatus,
      search: search || undefined,
      limit: limit ? Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100) : 20,
      offset: page ? (Math.max(parseInt(page, 10) || 0, 0)) * (limit ? Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100) : 20) : 0,
    } : undefined

    const result = await deps.getComplianceUseCase.execute(c.req.param('id'), eventFilter)
    return c.json(result)
  })

  workspaces.patch('/api/workspaces/:id/guardrail-events/:eventId/status', async (c) => {
    const user = c.get('user') as AuthUser
    await guardWorkspace(c.req.param('id'), user.org_id)
    const body = await c.req.json<{ status: string }>()
    if (body.status !== 'open' && body.status !== 'flagged' && body.status !== 'dismissed') {
      return c.json({ error: 'invalid_status' }, 400)
    }
    await deps.guardrailEventRepo.updateStatus(c.req.param('eventId'), body.status)
    return c.json({ status: body.status })
  })

  workspaces.get('/api/workspaces/:id', async (c) => {
    const user = c.get('user') as AuthUser
    try {
      await guardWorkspace(c.req.param('id'), user.org_id)
      const detail = await deps.getWorkspaceDetailUseCase.execute(c.req.param('id'))
      return c.json(detail)
    } catch (err) {
      if (err instanceof NotFoundError) return c.json({ error: 'not_found' }, 404)
      throw err
    }
  })

  workspaces.put('/api/workspaces/:id', async (c) => {
    const result = await parseBody(c, updateWorkspaceSchema)
    if (!result.success) return result.response
    const user = c.get('user') as AuthUser

    try {
      await guardWorkspace(c.req.param('id'), user.org_id)
      await deps.updateWorkspaceUseCase.execute(c.req.param('id'), result.data)
      return c.json({ status: 'ok' })
    } catch (err) {
      if (err instanceof NotFoundError) return c.json({ error: 'not_found' }, 404)
      throw err
    }
  })

  workspaces.get('/api/workspaces/:id/activity', async (c) => {
    const user = c.get('user') as AuthUser
    await guardWorkspace(c.req.param('id'), user.org_id)
    const limit = parseInt(c.req.query('limit') || '20')
    const offset = parseInt(c.req.query('offset') || '0')
    const result = await deps.getActivityUseCase.execute(c.req.param('id'), limit, offset)
    return c.json({ activity: result.rows, total: result.total })
  })

  workspaces.get('/api/workspaces/:id/dashboard', async (c) => {
    const user = c.get('user') as AuthUser
    await guardWorkspace(c.req.param('id'), user.org_id)
    const result = await deps.getDashboardUseCase.execute(c.req.param('id'))
    return c.json(result)
  })

  // ── Delete workspace ──

  workspaces.delete('/api/workspaces/:id', async (c) => {
    const user = c.get('user') as AuthUser
    try {
      await guardWorkspace(c.req.param('id'), user.org_id)
      await deps.deleteWorkspaceUseCase.execute(c.req.param('id'))
      return c.json({ status: 'ok' })
    } catch (err) {
      if (err instanceof NotFoundError) return c.json({ error: 'not_found' }, 404)
      if (err instanceof ValidationError) return c.json({ error: 'validation_failed' }, 400)
      throw err
    }
  })

  // ── Publish / Unpublish ──

  workspaces.post('/api/workspaces/:id/publish', async (c) => {
    const user = c.get('user') as AuthUser
    try {
      await guardWorkspace(c.req.param('id'), user.org_id)
      await deps.publishWorkspaceUseCase.execute(c.req.param('id'), true)
      return c.json({ status: 'ok' })
    } catch (err) {
      if (err instanceof NotFoundError) return c.json({ error: 'not_found' }, 404)
      throw err
    }
  })

  workspaces.post('/api/workspaces/:id/unpublish', async (c) => {
    const user = c.get('user') as AuthUser
    try {
      await guardWorkspace(c.req.param('id'), user.org_id)
      await deps.publishWorkspaceUseCase.execute(c.req.param('id'), false)
      return c.json({ status: 'ok' })
    } catch (err) {
      if (err instanceof NotFoundError) return c.json({ error: 'not_found' }, 404)
      throw err
    }
  })

  // ── Guardrails ──

  workspaces.get('/api/workspaces/:id/guardrails', async (c) => {
    const user = c.get('user') as AuthUser
    const workspaceId = c.req.param('id')
    await guardWorkspace(workspaceId, user.org_id)

    const available = await deps.listAvailableGuardrails(user.org_id)
    const enabled = await deps.workspaceRepo.findEnabledGuardrailConfigs(workspaceId)
    const enabledIds = new Set(enabled.map(e => e.guardrail_id))

    // Fetch org-level policy enforcement for each guardrail
    const policies = await deps.guardrailPolicyRepo.listByOrg(user.org_id)
    const policyMap = new Map(policies.map(p => [p.plugin_id, p.enforcement]))

    const guardrails = available.map(g => ({
      ...g,
      enabled: enabledIds.has(g.id),
      workspaceConfig: enabled.find(e => e.guardrail_id === g.id)?.config || null,
      enforcement: policyMap.get(g.id) || null,
    }))

    return c.json({ guardrails })
  })

  workspaces.post('/api/workspaces/:id/guardrails/:guardrailId/enable', async (c) => {
    const user = c.get('user') as AuthUser
    const workspaceId = c.req.param('id')
    const guardrailId = c.req.param('guardrailId')
    await guardWorkspace(workspaceId, user.org_id)

    const body = await c.req.json().catch(() => ({})) as { config?: string }
    const { generateId } = await import('../../domain/shared/EntityId.js')
    await deps.workspaceRepo.enableGuardrail(generateId(), workspaceId, guardrailId, body.config)

    return c.json({ ok: true })
  })

  workspaces.post('/api/workspaces/:id/guardrails/:guardrailId/disable', async (c) => {
    const user = c.get('user') as AuthUser
    const workspaceId = c.req.param('id')
    const guardrailId = c.req.param('guardrailId')
    await guardWorkspace(workspaceId, user.org_id)

    await deps.workspaceRepo.disableGuardrail(workspaceId, guardrailId)

    return c.json({ ok: true })
  })

  return workspaces
}
