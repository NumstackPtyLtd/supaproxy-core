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
import type { CreateKnowledgeSourceUseCase } from '../../application/workspace/CreateKnowledgeSourceUseCase.js'
import type { DeleteKnowledgeSourceUseCase } from '../../application/workspace/DeleteKnowledgeSourceUseCase.js'
import type { GetComplianceUseCase } from '../../application/workspace/GetComplianceUseCase.js'
import type { DeleteWorkspaceUseCase } from '../../application/workspace/DeleteWorkspaceUseCase.js'
import type { PublishWorkspaceUseCase } from '../../application/workspace/PublishWorkspaceUseCase.js'
import type { UpdateGuardrailEventStatusUseCase } from '../../application/guardrail/UpdateGuardrailEventStatusUseCase.js'
import type { ListWorkspaceGuardrailsUseCase } from '../../application/workspace/ListWorkspaceGuardrailsUseCase.js'
import type { EnableGuardrailUseCase } from '../../application/workspace/EnableGuardrailUseCase.js'
import type { DisableGuardrailUseCase } from '../../application/workspace/DisableGuardrailUseCase.js'
import type { ListWorkspaceConsumersUseCase } from '../../application/workspace/ListWorkspaceConsumersUseCase.js'
import type { OrganisationRepository } from '../../domain/organisation/repository.js'
import type { WorkspaceRepository } from '../../domain/workspace/repository.js'
import type { TenantService } from '../../application/ports/TenantService.js'
import { type AuthEnv } from '../middleware/auth.js'
import { createGuardWorkspace } from '../helpers/guardWorkspace.js'
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
  createKnowledgeSourceUseCase: CreateKnowledgeSourceUseCase
  deleteKnowledgeSourceUseCase: DeleteKnowledgeSourceUseCase
  getComplianceUseCase: GetComplianceUseCase
  deleteWorkspaceUseCase: DeleteWorkspaceUseCase
  publishWorkspaceUseCase: PublishWorkspaceUseCase
  updateGuardrailEventStatusUseCase: UpdateGuardrailEventStatusUseCase
  listWorkspaceGuardrailsUseCase: ListWorkspaceGuardrailsUseCase
  enableGuardrailUseCase: EnableGuardrailUseCase
  disableGuardrailUseCase: DisableGuardrailUseCase
  listWorkspaceConsumersUseCase: ListWorkspaceConsumersUseCase
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

  const guardWorkspace = createGuardWorkspace(deps.workspaceRepo, deps.tenantService)

  // ── Mount sub-routes ──

  workspaces.route('/', createWorkspaceKnowledgeRoutes({
    getKnowledgeUseCase: deps.getKnowledgeUseCase,
    createKnowledgeSourceUseCase: deps.createKnowledgeSourceUseCase,
    deleteKnowledgeSourceUseCase: deps.deleteKnowledgeSourceUseCase,
    requireAuth: deps.requireAuth,
  }, guardWorkspace))

  workspaces.route('/', createWorkspaceActivityRoutes({
    getActivityUseCase: deps.getActivityUseCase,
    getComplianceUseCase: deps.getComplianceUseCase,
    updateGuardrailEventStatusUseCase: deps.updateGuardrailEventStatusUseCase,
    requireAuth: deps.requireAuth,
  }, guardWorkspace))

  workspaces.route('/', createWorkspaceGuardrailRoutes({
    listWorkspaceGuardrailsUseCase: deps.listWorkspaceGuardrailsUseCase,
    enableGuardrailUseCase: deps.enableGuardrailUseCase,
    disableGuardrailUseCase: deps.disableGuardrailUseCase,
    requireAuth: deps.requireAuth,
  }, guardWorkspace))

  workspaces.route('/', createWorkspaceConnectionRoutes({
    deleteConnectionUseCase: deps.deleteConnectionUseCase,
    getConnectionsUseCase: deps.getConnectionsUseCase,
    listWorkspaceConsumersUseCase: deps.listWorkspaceConsumersUseCase,
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
