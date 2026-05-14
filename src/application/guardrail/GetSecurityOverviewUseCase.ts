import type { GuardrailPolicyRepository, SecurityOverviewStats } from '../../domain/guardrail/policyRepository.js'

const MIN_DAYS = 1
const MAX_DAYS = 90
const DEFAULT_DAYS = 30

export class GetSecurityOverviewUseCase {
  constructor(private readonly policyRepo: GuardrailPolicyRepository) {}

  async execute(orgId: string, days?: number): Promise<SecurityOverviewStats> {
    const clampedDays = Math.min(Math.max(days ?? DEFAULT_DAYS, MIN_DAYS), MAX_DAYS)
    return this.policyRepo.getOrgEventStats(orgId, clampedDays)
  }
}
