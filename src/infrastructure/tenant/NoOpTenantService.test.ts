import { describe, it, expect } from 'vitest'
import { NoOpTenantService } from './NoOpTenantService.js'

describe('NoOpTenantService (single-tenant)', () => {
  const service = new NoOpTenantService()

  describe('scopeWorkspaceList', () => {
    it('returns null (no filtering, all workspaces visible)', () => {
      expect(service.scopeWorkspaceList('org-1')).toBeNull()
    })
  })

  describe('verifyWorkspaceAccess', () => {
    it('allows access when orgs match', () => {
      expect(() => service.verifyWorkspaceAccess('org-1', 'org-1')).not.toThrow()
    })

    it('allows access when orgs differ (single-tenant, no check)', () => {
      expect(() => service.verifyWorkspaceAccess('org-1', 'org-2')).not.toThrow()
    })

    it('allows access when workspace org is null', () => {
      expect(() => service.verifyWorkspaceAccess(null, 'org-1')).not.toThrow()
    })
  })

  describe('resolveOrgForCreation', () => {
    it('returns the user org ID', () => {
      expect(service.resolveOrgForCreation('org-abc')).toBe('org-abc')
    })
  })
})
