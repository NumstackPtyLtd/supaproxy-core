import type { WorkspaceRepository } from '../../domain/workspace/repository.js'
import type { TenantService } from '../../application/ports/TenantService.js'

export type GuardFn = (workspaceId: string, userOrgId: string) => Promise<void>

export function createGuardWorkspace(workspaceRepo: WorkspaceRepository, tenantService: TenantService): GuardFn {
  return async (workspaceId: string, userOrgId: string) => {
    const ws = await workspaceRepo.findById(workspaceId)
    tenantService.verifyWorkspaceAccess(ws?.org_id ?? null, userOrgId)
  }
}
