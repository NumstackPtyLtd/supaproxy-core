import type { GuardrailPolicyRepository, PolicyEnforcement, PolicyComplianceRow } from '../../domain/guardrail/policyRepository.js'
import { generateId } from '../../domain/shared/EntityId.js'
import { ValidationError } from '../../domain/shared/errors.js'

const VALID_ENFORCEMENT: PolicyEnforcement[] = ['mandatory', 'recommended', 'off']

export class ManagePoliciesUseCase {
  constructor(private readonly policyRepo: GuardrailPolicyRepository) {}

  async listPolicies(orgId: string) {
    return this.policyRepo.listByOrg(orgId)
  }

  async setEnforcement(orgId: string, pluginId: string, enforcement: PolicyEnforcement): Promise<void> {
    if (!VALID_ENFORCEMENT.includes(enforcement)) {
      throw new ValidationError(`Invalid enforcement level: ${enforcement}`)
    }

    const existing = await this.policyRepo.findByOrgAndPlugin(orgId, pluginId)
    const id = existing?.id ?? generateId()

    await this.policyRepo.upsert({
      id,
      org_id: orgId,
      plugin_id: pluginId,
      enforcement,
    })
  }

  async getCompliance(orgId: string, pluginId: string, search?: string): Promise<PolicyComplianceRow[]> {
    const policy = await this.policyRepo.findByOrgAndPlugin(orgId, pluginId)
    if (!policy) return []
    return this.policyRepo.getComplianceForPolicy(policy.id, pluginId, orgId, search)
  }
}
