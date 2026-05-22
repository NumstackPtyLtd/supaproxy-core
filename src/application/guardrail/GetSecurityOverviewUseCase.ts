import type { GuardrailPolicyRepository, SecurityOverviewStats } from '../../domain/guardrail/policyRepository.js'
import { SECURITY_MIN_DAYS, SECURITY_MAX_DAYS, SECURITY_DEFAULT_DAYS } from '../../defaults.js'

export class GetSecurityOverviewUseCase {
  constructor(private readonly policyRepo: GuardrailPolicyRepository) {}

  async execute(orgId: string, days?: number): Promise<SecurityOverviewStats> {
    const clampedDays = Math.min(Math.max(days ?? SECURITY_DEFAULT_DAYS, SECURITY_MIN_DAYS), SECURITY_MAX_DAYS)
    return this.policyRepo.getOrgEventStats(orgId, clampedDays)
  }
}
