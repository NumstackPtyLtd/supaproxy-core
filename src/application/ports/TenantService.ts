/**
 * Tenant isolation port.
 *
 * Open-source: uses NoOpTenantService (single-tenant, no scoping).
 * Cloud: installs @supaproxy/cloud-tenant which scopes all data
 * by org_id, enforces access guards, and adds usage limits.
 *
 * The server provides the hook; the implementation is pluggable.
 */
export interface TenantService {
  /**
   * Scope a workspace listing query.
   * Returns orgId to filter by, or null for no filtering (single-tenant).
   */
  scopeWorkspaceList(userOrgId: string): string | null

  /**
   * Verify the user has access to this workspace.
   * Throws if access is denied.
   * No-op in single-tenant mode.
   */
  verifyWorkspaceAccess(workspaceOrgId: string | null, userOrgId: string): void

  /**
   * Get the org_id to assign when creating a workspace.
   * Returns userOrgId in multi-tenant, or the single org in single-tenant.
   */
  resolveOrgForCreation(userOrgId: string): string
}
