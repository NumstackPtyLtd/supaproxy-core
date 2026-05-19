import { describe, it, expect, vi } from 'vitest'
import { ManagePoliciesUseCase } from './ManagePoliciesUseCase.js'
import { mockGuardrailPolicyRepo } from '../../__tests__/mocks.js'
import type { GuardrailPolicyData } from '../../domain/guardrail/policyRepository.js'

describe('ManagePoliciesUseCase', () => {
  function setup() {
    const policyRepo = mockGuardrailPolicyRepo()
    const useCase = new ManagePoliciesUseCase(policyRepo)
    return { policyRepo, useCase }
  }

  describe('listPolicies', () => {
    it('returns all policies for the org', async () => {
      const { policyRepo, useCase } = setup()
      const policies: GuardrailPolicyData[] = [
        { id: 'p1', org_id: 'org-1', plugin_id: 'pattern-guard', enforcement: 'mandatory' },
        { id: 'p2', org_id: 'org-1', plugin_id: 'write-guard', enforcement: 'recommended' },
      ]
      vi.mocked(policyRepo.listByOrg).mockResolvedValue(policies)

      const result = await useCase.listPolicies('org-1')

      expect(policyRepo.listByOrg).toHaveBeenCalledWith('org-1')
      expect(result).toEqual(policies)
    })

    it('returns empty array when no policies exist', async () => {
      const { useCase } = setup()
      const result = await useCase.listPolicies('org-1')
      expect(result).toEqual([])
    })
  })

  describe('setEnforcement', () => {
    it('creates a new policy when none exists', async () => {
      const { policyRepo, useCase } = setup()
      vi.mocked(policyRepo.findByOrgAndPlugin).mockResolvedValue(null)

      await useCase.setEnforcement('org-1', 'pattern-guard', 'mandatory')

      expect(policyRepo.findByOrgAndPlugin).toHaveBeenCalledWith('org-1', 'pattern-guard')
      expect(policyRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          org_id: 'org-1',
          plugin_id: 'pattern-guard',
          enforcement: 'mandatory',
        }),
      )
    })

    it('updates an existing policy', async () => {
      const { policyRepo, useCase } = setup()
      const existing: GuardrailPolicyData = { id: 'p1', org_id: 'org-1', plugin_id: 'pattern-guard', enforcement: 'off' }
      vi.mocked(policyRepo.findByOrgAndPlugin).mockResolvedValue(existing)

      await useCase.setEnforcement('org-1', 'pattern-guard', 'mandatory')

      expect(policyRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'p1',
          enforcement: 'mandatory',
        }),
      )
    })

    it('rejects invalid enforcement values', async () => {
      const { useCase } = setup()
      await expect(useCase.setEnforcement('org-1', 'pattern-guard', 'invalid' as never)).rejects.toThrow()
    })

    it('deletes overrides when setting enforcement to off', async () => {
      const { policyRepo, useCase } = setup()
      const existing: GuardrailPolicyData = { id: 'p1', org_id: 'org-1', plugin_id: 'pattern-guard', enforcement: 'recommended' }
      vi.mocked(policyRepo.findByOrgAndPlugin).mockResolvedValue(existing)

      await useCase.setEnforcement('org-1', 'pattern-guard', 'off')

      expect(policyRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ enforcement: 'off' }),
      )
    })
  })

  describe('getCompliance', () => {
    it('returns compliance rows for a policy', async () => {
      const { policyRepo, useCase } = setup()
      const existing: GuardrailPolicyData = { id: 'p1', org_id: 'org-1', plugin_id: 'pattern-guard', enforcement: 'mandatory' }
      vi.mocked(policyRepo.findByOrgAndPlugin).mockResolvedValue(existing)
      vi.mocked(policyRepo.getComplianceForPolicy).mockResolvedValue([
        { workspace_id: 'ws-1', workspace_name: 'General', enabled: true, has_override: false, is_default: true },
        { workspace_id: 'ws-2', workspace_name: 'Sales', enabled: false, has_override: false, is_default: false },
      ])

      const result = await useCase.getCompliance('org-1', 'pattern-guard')

      expect(policyRepo.getComplianceForPolicy).toHaveBeenCalledWith('p1', 'pattern-guard', 'org-1', undefined)
      expect(result).toHaveLength(2)
      expect(result[1].enabled).toBe(false)
    })

    it('returns empty array when policy does not exist', async () => {
      const { policyRepo, useCase } = setup()
      vi.mocked(policyRepo.findByOrgAndPlugin).mockResolvedValue(null)

      const result = await useCase.getCompliance('org-1', 'pattern-guard')
      expect(result).toEqual([])
    })
  })
})
