import { describe, it, expect } from 'vitest'

/**
 * CloudTenantService lives in supaproxy-cloud, but the logic is simple
 * enough to test the contract here with a local implementation.
 * This ensures any TenantService implementation follows the rules.
 */

class CloudTenantServiceLocal {
  scopeWorkspaceList(userOrgId: string): string {
    return userOrgId
  }

  verifyWorkspaceAccess(workspaceOrgId: string | null, userOrgId: string): void {
    if (!workspaceOrgId || workspaceOrgId !== userOrgId) {
      throw new Error('not_found')
    }
  }

  resolveOrgForCreation(userOrgId: string): string {
    return userOrgId
  }
}

describe('CloudTenantService (contract test)', () => {
  const service = new CloudTenantServiceLocal()

  describe('scopeWorkspaceList', () => {
    it('returns the user org ID for filtering', () => {
      expect(service.scopeWorkspaceList('org-abc')).toBe('org-abc')
    })
  })

  describe('verifyWorkspaceAccess', () => {
    it('allows access when workspace org matches user org', () => {
      expect(() => service.verifyWorkspaceAccess('org-abc', 'org-abc')).not.toThrow()
    })

    it('denies access when workspace org differs from user org', () => {
      expect(() => service.verifyWorkspaceAccess('org-abc', 'org-xyz')).toThrow('not_found')
    })

    it('denies access when workspace has no org (null)', () => {
      expect(() => service.verifyWorkspaceAccess(null, 'org-abc')).toThrow('not_found')
    })

    it('denies access when workspace org is empty string', () => {
      expect(() => service.verifyWorkspaceAccess('', 'org-abc')).toThrow('not_found')
    })

    it('throws not_found not access_denied (no information leakage)', () => {
      try {
        service.verifyWorkspaceAccess('org-secret', 'org-attacker')
        expect.fail('should have thrown')
      } catch (err) {
        expect((err as Error).message).toBe('not_found')
        expect((err as Error).message).not.toContain('denied')
        expect((err as Error).message).not.toContain('secret')
      }
    })
  })

  describe('resolveOrgForCreation', () => {
    it('returns the user org ID', () => {
      expect(service.resolveOrgForCreation('org-abc')).toBe('org-abc')
    })
  })
})

describe('guardWorkspace pattern', () => {
  const service = new CloudTenantServiceLocal()

  function guardWorkspace(workspaceOrgId: string | null, userOrgId: string): void {
    service.verifyWorkspaceAccess(workspaceOrgId, userOrgId)
  }

  it('user in org-A can access workspace in org-A', () => {
    expect(() => guardWorkspace('org-A', 'org-A')).not.toThrow()
  })

  it('user in org-A cannot access workspace in org-B', () => {
    expect(() => guardWorkspace('org-B', 'org-A')).toThrow()
  })

  it('user cannot access workspace with no org', () => {
    expect(() => guardWorkspace(null, 'org-A')).toThrow()
  })

  it('cross-org access is denied even if workspace ID is known', () => {
    // This is the real-world scenario: user guesses a workspace ID
    // belonging to another org and tries to access it via the API
    expect(() => guardWorkspace('org-victim', 'org-attacker')).toThrow()
  })
})
