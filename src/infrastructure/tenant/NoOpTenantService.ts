import type { TenantService } from '../../application/ports/TenantService.js'

/**
 * Single-tenant implementation. No org scoping.
 *
 * Used by default in the open-source server. All workspaces
 * are visible, no access checks, creation uses the user's org.
 */
export class NoOpTenantService implements TenantService {
  scopeWorkspaceList(_userOrgId: string): string | null {
    return null // No filtering; show all workspaces
  }

  verifyWorkspaceAccess(_workspaceOrgId: string | null, _userOrgId: string): void {
    // No-op: all access allowed in single-tenant mode
  }

  resolveOrgForCreation(userOrgId: string): string {
    return userOrgId
  }
}
