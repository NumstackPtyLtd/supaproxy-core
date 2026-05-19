import { describe, it, expect, vi } from 'vitest'
import { CreatePolicyOverrideUseCase } from './CreatePolicyOverrideUseCase.js'
import { mockGuardrailPolicyRepo } from '../../__tests__/mocks.js'
import type { GuardrailPolicyData } from '../../domain/guardrail/policyRepository.js'

describe('CreatePolicyOverrideUseCase', () => {
  function setup() {
    const policyRepo = mockGuardrailPolicyRepo()
    const useCase = new CreatePolicyOverrideUseCase(policyRepo)
    return { policyRepo, useCase }
  }

  it('creates an override for a recommended policy', async () => {
    const { policyRepo, useCase } = setup()
    const policy: GuardrailPolicyData = { id: 'p1', org_id: 'org-1', plugin_id: 'pattern-guard', enforcement: 'recommended' }
    vi.mocked(policyRepo.findByOrgAndPlugin).mockResolvedValue(policy)
    vi.mocked(policyRepo.findOverride).mockResolvedValue(null)

    await useCase.execute({
      orgId: 'org-1',
      pluginId: 'pattern-guard',
      workspaceId: 'ws-1',
      justification: 'Not needed for this workspace',
      userId: 'user-1',
    })

    expect(policyRepo.createOverride).toHaveBeenCalledWith(
      expect.objectContaining({
        policy_id: 'p1',
        workspace_id: 'ws-1',
        justification: 'Not needed for this workspace',
        created_by: 'user-1',
      }),
    )
  })

  it('rejects override for mandatory policy', async () => {
    const { policyRepo, useCase } = setup()
    const policy: GuardrailPolicyData = { id: 'p1', org_id: 'org-1', plugin_id: 'pattern-guard', enforcement: 'mandatory' }
    vi.mocked(policyRepo.findByOrgAndPlugin).mockResolvedValue(policy)

    await expect(useCase.execute({
      orgId: 'org-1',
      pluginId: 'pattern-guard',
      workspaceId: 'ws-1',
      justification: 'Trying to skip',
      userId: 'user-1',
    })).rejects.toThrow('mandatory')
  })

  it('rejects override when policy does not exist', async () => {
    const { policyRepo, useCase } = setup()
    vi.mocked(policyRepo.findByOrgAndPlugin).mockResolvedValue(null)

    await expect(useCase.execute({
      orgId: 'org-1',
      pluginId: 'pattern-guard',
      workspaceId: 'ws-1',
      justification: 'Reason',
      userId: 'user-1',
    })).rejects.toThrow()
  })

  it('rejects override when one already exists', async () => {
    const { policyRepo, useCase } = setup()
    const policy: GuardrailPolicyData = { id: 'p1', org_id: 'org-1', plugin_id: 'pattern-guard', enforcement: 'recommended' }
    vi.mocked(policyRepo.findByOrgAndPlugin).mockResolvedValue(policy)
    vi.mocked(policyRepo.findOverride).mockResolvedValue({
      id: 'ov1', policy_id: 'p1', workspace_id: 'ws-1',
      justification: 'Already overridden', created_by: 'user-1',
    })

    await expect(useCase.execute({
      orgId: 'org-1',
      pluginId: 'pattern-guard',
      workspaceId: 'ws-1',
      justification: 'Again',
      userId: 'user-1',
    })).rejects.toThrow('already exists')
  })

  it('rejects empty justification', async () => {
    const { policyRepo, useCase } = setup()
    const policy: GuardrailPolicyData = { id: 'p1', org_id: 'org-1', plugin_id: 'pattern-guard', enforcement: 'recommended' }
    vi.mocked(policyRepo.findByOrgAndPlugin).mockResolvedValue(policy)

    await expect(useCase.execute({
      orgId: 'org-1',
      pluginId: 'pattern-guard',
      workspaceId: 'ws-1',
      justification: '  ',
      userId: 'user-1',
    })).rejects.toThrow('justification')
  })
})
