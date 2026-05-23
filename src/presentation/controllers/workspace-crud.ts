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
import { handleDomainError } from '../helpers/handleDomainError.js'
import type { GuardFn } from '../helpers/guardWorkspace.js'
import { createWorkspaceSchema, updateWorkspaceSchema } from '../validators/workspace-crud.js'

const log = pino({ name: 'routes/workspace-crud' })

export interface WorkspaceCrudRouteDeps {
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

export function listTeams(deps: WorkspaceCrudRouteDeps) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const user = c.get('user') as AuthUser
    const teams = await deps.orgRepo.listTeams(user.org_id)
    return c.json({ teams })
  }
}

export function createWorkspace(deps: WorkspaceCrudRouteDeps) {
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
      return handleDomainError(c, err)
    }
  }
}

export function listWorkspaces(deps: WorkspaceCrudRouteDeps) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const user = c.get('user') as AuthUser
    const orgScope = deps.tenantService.scopeWorkspaceList(user.org_id)
    const rows = await deps.listWorkspacesUseCase.execute(orgScope)
    return c.json({ workspaces: rows })
  }
}

export function getWorkspaceSummary(deps: WorkspaceCrudRouteDeps, guard: GuardFn) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const user = c.get('user') as AuthUser
    try {
      await guard(c.req.param('id')!, user.org_id)
      const workspace = await deps.getWorkspaceSummaryUseCase.execute(c.req.param('id')!)
      return c.json({ workspace })
    } catch (err) {
      return handleDomainError(c, err)
    }
  }
}

export function getWorkspaceDetail(deps: WorkspaceCrudRouteDeps, guard: GuardFn) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const user = c.get('user') as AuthUser
    try {
      await guard(c.req.param('id')!, user.org_id)
      const detail = await deps.getWorkspaceDetailUseCase.execute(c.req.param('id')!)
      return c.json(detail)
    } catch (err) {
      return handleDomainError(c, err)
    }
  }
}

export function updateWorkspace(deps: WorkspaceCrudRouteDeps, guard: GuardFn) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const result = await parseBody(c, updateWorkspaceSchema)
    if (!result.success) return result.response
    const user = c.get('user') as AuthUser

    try {
      await guard(c.req.param('id')!, user.org_id)
      await deps.updateWorkspaceUseCase.execute(c.req.param('id')!, result.data)
      return c.json({ status: 'ok' })
    } catch (err) {
      return handleDomainError(c, err)
    }
  }
}

export function getDashboard(deps: WorkspaceCrudRouteDeps, guard: GuardFn) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const user = c.get('user') as AuthUser
    await guard(c.req.param('id')!, user.org_id)
    const result = await deps.getDashboardUseCase.execute(c.req.param('id')!)
    return c.json(result)
  }
}

export function deleteWorkspace(deps: WorkspaceCrudRouteDeps, guard: GuardFn) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const user = c.get('user') as AuthUser
    try {
      await guard(c.req.param('id')!, user.org_id)
      await deps.deleteWorkspaceUseCase.execute(c.req.param('id')!)
      return c.json({ status: 'ok' })
    } catch (err) {
      return handleDomainError(c, err)
    }
  }
}
