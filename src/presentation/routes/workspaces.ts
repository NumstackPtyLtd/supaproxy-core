import { Hono } from 'hono'
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
import type { IndexKnowledgeForWorkspaceUseCase } from '../../application/knowledge/IndexKnowledgeForWorkspaceUseCase.js'
import type { GetComplianceUseCase } from '../../application/workspace/GetComplianceUseCase.js'
import type { DeleteWorkspaceUseCase } from '../../application/workspace/DeleteWorkspaceUseCase.js'
import type { PublishWorkspaceUseCase } from '../../application/workspace/PublishWorkspaceUseCase.js'
import type { GuardrailEventRepository } from '../../domain/guardrail/repository.js'
import type { GuardrailPolicyRepository } from '../../domain/guardrail/policyRepository.js'
import type { OrganisationRepository } from '../../domain/organisation/repository.js'
import type { WorkspaceRepository } from '../../domain/workspace/repository.js'
import type { TenantService } from '../../application/ports/TenantService.js'
import { type AuthEnv } from '../middleware/auth.js'
import { createWorkspaceKnowledgeRoutes } from './workspace-knowledge.js'
import { createWorkspaceActivityRoutes } from './workspace-activity.js'
import { createWorkspaceGuardrailRoutes } from './workspace-guardrails.js'
import { createWorkspaceConnectionRoutes } from './workspace-connections.js'
import { createWorkspaceCrudRoutes } from './workspace-crud.js'
import { createWorkspacePublishRoutes } from './workspace-publish.js'

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
  indexKnowledgeUseCase?: IndexKnowledgeForWorkspaceUseCase
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

  // Helper: verify workspace belongs to user's org (delegates to tenant service)
  async function guardWorkspace(workspaceId: string, userOrgId: string) {
    const ws = await deps.workspaceRepo.findById(workspaceId)
    deps.tenantService.verifyWorkspaceAccess(ws?.org_id ?? null, userOrgId)
  }

  // ── Mount sub-routes ──

  workspaces.route('/', createWorkspaceKnowledgeRoutes({
    getKnowledgeUseCase: deps.getKnowledgeUseCase,
    indexKnowledgeUseCase: deps.indexKnowledgeUseCase,
    workspaceRepo: deps.workspaceRepo,
    tenantService: deps.tenantService,
    requireAuth: deps.requireAuth,
  }, guardWorkspace))

  workspaces.route('/', createWorkspaceActivityRoutes({
    getActivityUseCase: deps.getActivityUseCase,
    getComplianceUseCase: deps.getComplianceUseCase,
    guardrailEventRepo: deps.guardrailEventRepo,
    tenantService: deps.tenantService,
    requireAuth: deps.requireAuth,
  }, guardWorkspace))

  workspaces.route('/', createWorkspaceGuardrailRoutes({
    listAvailableGuardrails: deps.listAvailableGuardrails,
    guardrailPolicyRepo: deps.guardrailPolicyRepo,
    workspaceRepo: deps.workspaceRepo,
    tenantService: deps.tenantService,
    requireAuth: deps.requireAuth,
  }, guardWorkspace))

  workspaces.route('/', createWorkspaceConnectionRoutes({
    deleteConnectionUseCase: deps.deleteConnectionUseCase,
    getConnectionsUseCase: deps.getConnectionsUseCase,
    workspaceRepo: deps.workspaceRepo,
    tenantService: deps.tenantService,
    requireAuth: deps.requireAuth,
  }, guardWorkspace))

  workspaces.route('/', createWorkspaceCrudRoutes({
    createWorkspaceUseCase: deps.createWorkspaceUseCase,
    updateWorkspaceUseCase: deps.updateWorkspaceUseCase,
    getWorkspaceDetailUseCase: deps.getWorkspaceDetailUseCase,
    listWorkspacesUseCase: deps.listWorkspacesUseCase,
    getWorkspaceSummaryUseCase: deps.getWorkspaceSummaryUseCase,
    getDashboardUseCase: deps.getDashboardUseCase,
    deleteWorkspaceUseCase: deps.deleteWorkspaceUseCase,
    orgRepo: deps.orgRepo,
    tenantService: deps.tenantService,
    requireAuth: deps.requireAuth,
  }, guardWorkspace))

  workspaces.route('/', createWorkspacePublishRoutes({
    publishWorkspaceUseCase: deps.publishWorkspaceUseCase,
    tenantService: deps.tenantService,
    requireAuth: deps.requireAuth,
  }, guardWorkspace))

  return workspaces
}
