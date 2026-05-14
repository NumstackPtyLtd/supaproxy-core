import { describe, it, expect, vi } from 'vitest'
import { GetSecurityOverviewUseCase } from './GetSecurityOverviewUseCase.js'
import { mockGuardrailPolicyRepo } from '../../__tests__/mocks.js'
import type { SecurityOverviewStats } from '../../domain/guardrail/policyRepository.js'

describe('GetSecurityOverviewUseCase', () => {
  function setup() {
    const policyRepo = mockGuardrailPolicyRepo()
    const useCase = new GetSecurityOverviewUseCase(policyRepo)
    return { policyRepo, useCase }
  }

  it('returns org-wide security overview with default 30 days', async () => {
    const { policyRepo, useCase } = setup()
    const stats: SecurityOverviewStats = {
      total_events: 42,
      blocked_events: 30,
      stripped_events: 12,
      flagged_events: 5,
      events_by_day: [{ date: '2026-05-01', blocked: 10, stripped: 5 }],
      top_workspaces: [{ workspace_id: 'ws-1', workspace_name: 'General', event_count: 20 }],
      recent_flagged: [],
      compliance_score: 80,
      total_workspaces: 5,
      compliant_workspaces: 4,
    }
    vi.mocked(policyRepo.getOrgEventStats).mockResolvedValue(stats)

    const result = await useCase.execute('org-1')

    expect(policyRepo.getOrgEventStats).toHaveBeenCalledWith('org-1', 30)
    expect(result.total_events).toBe(42)
    expect(result.compliance_score).toBe(80)
  })

  it('accepts custom day range', async () => {
    const { policyRepo, useCase } = setup()

    await useCase.execute('org-1', 7)

    expect(policyRepo.getOrgEventStats).toHaveBeenCalledWith('org-1', 7)
  })

  it('clamps days to a minimum of 1', async () => {
    const { policyRepo, useCase } = setup()

    await useCase.execute('org-1', 0)

    expect(policyRepo.getOrgEventStats).toHaveBeenCalledWith('org-1', 1)
  })

  it('clamps days to a maximum of 90', async () => {
    const { policyRepo, useCase } = setup()

    await useCase.execute('org-1', 365)

    expect(policyRepo.getOrgEventStats).toHaveBeenCalledWith('org-1', 90)
  })
})
