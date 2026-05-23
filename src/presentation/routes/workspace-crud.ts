import { Hono } from 'hono'
import { z } from 'zod'
import pino from 'pino'
import type { CreateWorkspaceUseCase } from '../../application/workspace/CreateWorkspaceUseCase.js'
import type { UpdateWorkspaceUseCase } from '../../application/workspace/UpdateWorkspaceUseCase.js'
import type { GetWorkspaceDetailUseCase } from '../../application/workspace/GetWorkspaceDetailUseCase.js'
import type { ListWorkspacesUseCase } from '../../application/workspace/ListWorkspacesUseCase.js'
import type { GetWorkspaceSummaryUseCase } from '../../application/workspace/GetWorkspaceSummaryUseCase.js'
import type { GetDashboardUseCase } from '../../application/workspace/GetDashboardUseCase.js'
import type { DeleteWorkspaceUseCase } from '../../application/workspace/DeleteWorkspaceUseCase.js'
import type { OrganisationRepository } from '../../domain/organisation/repository.js'
import type { TenantService } from '../../application/ports/TenantService.js'
import { parseBody } from '../middleware/validate.js'
import { type AuthUser, type AuthEnv } from '../middleware/auth.js'
import { NotFoundError, ConflictError, ValidationError } from '../../domain/shared/errors.js'
import { MAX_WORKSPACE_NAME_LENGTH, MAX_TIMEOUT_MINUTES, MAX_SYSTEM_PROMPT_LENGTH } from '../../defaults.js'

const log = pino({ name: 'routes/workspace-crud' })
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
  provider_type: z.string().min(1).max(50).nullable().optional(),
  system_prompt: z.string().max(MAX_SYSTEM_PROMPT_LENGTH).optional(),
  cold_timeout_minutes: z.number().int().min(1).max(MAX_TIMEOUT_MINUTES).nullable().optional(),
  close_timeout_minutes: z.number().int().min(1).max(MAX_TIMEOUT_MINUTES).nullable().optional(),
})

interface WorkspaceCrudRouteDeps {
  createWorkspaceUseCase: CreateWorkspaceUseCase
  updateWorkspaceUseCase: UpdateWorkspaceUseCase
  getWorkspaceDetailUseCase: GetWorkspaceDetailUseCase
  listWorkspacesUseCase: ListWorkspacesUseCase
  getWorkspaceSummaryUseCase: GetWorkspaceSummaryUseCase
  getDashboardUseCase: GetDashboardUseCase
  deleteWorkspaceUseCase: DeleteWorkspaceUseCase
  orgRepo: OrganisationRepository
  tenantService: TenantService
  requireAuth: (c: import('hono').Context, next: import('hono').Next) => Promise<Response | void>
}

type GuardFn = (workspaceId: string, userOrgId: string) => Promise<void>

function listTeams(deps: WorkspaceCrudRouteDeps) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const user = c.get('user') as AuthUser
    const teams = await deps.orgRepo.listTeams(user.org_id)
    return c.json({ teams })
  }
}

function createWorkspace(deps: WorkspaceCrudRouteDeps) {
  return async (c: import('hono').Context<AuthEnv>) => {
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
  }
}

function listWorkspaces(deps: WorkspaceCrudRouteDeps) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const user = c.get('user') as AuthUser
    const orgScope = deps.tenantService.scopeWorkspaceList(user.org_id)
    const rows = await deps.listWorkspacesUseCase.execute(orgScope)
    return c.json({ workspaces: rows })
  }
}

function getWorkspaceSummary(deps: WorkspaceCrudRouteDeps, guard: GuardFn) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const user = c.get('user') as AuthUser
    try {
      await guard(c.req.param('id')!, user.org_id)
      const workspace = await deps.getWorkspaceSummaryUseCase.execute(c.req.param('id')!)
      return c.json({ workspace })
    } catch (err) {
      if (err instanceof NotFoundError) return c.json({ error: 'not_found' }, 404)
      throw err
    }
  }
}

function getWorkspaceDetail(deps: WorkspaceCrudRouteDeps, guard: GuardFn) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const user = c.get('user') as AuthUser
    try {
      await guard(c.req.param('id')!, user.org_id)
      const detail = await deps.getWorkspaceDetailUseCase.execute(c.req.param('id')!)
      return c.json(detail)
    } catch (err) {
      if (err instanceof NotFoundError) return c.json({ error: 'not_found' }, 404)
      throw err
    }
  }
}

function updateWorkspace(deps: WorkspaceCrudRouteDeps, guard: GuardFn) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const result = await parseBody(c, updateWorkspaceSchema)
    if (!result.success) return result.response
    const user = c.get('user') as AuthUser

    try {
      await guard(c.req.param('id')!, user.org_id)
      await deps.updateWorkspaceUseCase.execute(c.req.param('id')!, result.data)
      return c.json({ status: 'ok' })
    } catch (err) {
      if (err instanceof NotFoundError) return c.json({ error: 'not_found' }, 404)
      throw err
    }
  }
}

function getDashboard(deps: WorkspaceCrudRouteDeps, guard: GuardFn) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const user = c.get('user') as AuthUser
    await guard(c.req.param('id')!, user.org_id)
    const result = await deps.getDashboardUseCase.execute(c.req.param('id')!)
    return c.json(result)
  }
}

function deleteWorkspace(deps: WorkspaceCrudRouteDeps, guard: GuardFn) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const user = c.get('user') as AuthUser
    try {
      await guard(c.req.param('id')!, user.org_id)
      await deps.deleteWorkspaceUseCase.execute(c.req.param('id')!)
      return c.json({ status: 'ok' })
    } catch (err) {
      if (err instanceof NotFoundError) return c.json({ error: 'not_found' }, 404)
      if (err instanceof ValidationError) return c.json({ error: 'validation_failed' }, 400)
      throw err
    }
  }
}

export function createWorkspaceCrudRoutes(deps: WorkspaceCrudRouteDeps, guardWorkspace: GuardFn) {
  const app = new Hono<AuthEnv>()

  app.get('/api/teams', listTeams(deps))
  app.post('/api/workspaces', createWorkspace(deps))
  app.get('/api/workspaces', listWorkspaces(deps))
  app.get('/api/workspaces/:id/summary', getWorkspaceSummary(deps, guardWorkspace))
  app.get('/api/workspaces/:id', getWorkspaceDetail(deps, guardWorkspace))
  app.put('/api/workspaces/:id', updateWorkspace(deps, guardWorkspace))
  app.get('/api/workspaces/:id/dashboard', getDashboard(deps, guardWorkspace))
  app.delete('/api/workspaces/:id', deleteWorkspace(deps, guardWorkspace))

  return app
}
