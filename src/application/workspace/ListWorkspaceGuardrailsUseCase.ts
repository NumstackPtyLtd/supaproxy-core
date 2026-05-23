import type { WorkspaceRepository } from '../../domain/workspace/repository.js'
import type { GuardrailPolicyRepository } from '../../domain/guardrail/policyRepository.js'

interface AvailableGuardrail {
  id: string
  name: string
  description: string
  stage: string
  source: 'core' | 'marketplace'
  configSchema: { fields: Array<Record<string, unknown>> }
}

interface EnrichedGuardrail extends AvailableGuardrail {
  enabled: boolean
  workspaceConfig: string | null
  enforcement: string | null
}

export class ListWorkspaceGuardrailsUseCase {
  constructor(
    private readonly workspaceRepo: WorkspaceRepository,
    private readonly guardrailPolicyRepo: GuardrailPolicyRepository,
    private readonly listAvailable: (orgId: string) => Promise<AvailableGuardrail[]>,
  ) {}

  async execute(workspaceId: string, orgId: string): Promise<EnrichedGuardrail[]> {
    const [available, enabled, policies] = await Promise.all([
      this.listAvailable(orgId),
      this.workspaceRepo.findEnabledGuardrailConfigs(workspaceId),
      this.guardrailPolicyRepo.listByOrg(orgId),
    ])

    const enabledIds = new Set(enabled.map(e => e.guardrail_id))
    const policyMap = new Map(policies.map(p => [p.plugin_id, p.enforcement]))

    return available.map(g => ({
      ...g,
      enabled: enabledIds.has(g.id),
      workspaceConfig: enabled.find(e => e.guardrail_id === g.id)?.config || null,
      enforcement: policyMap.get(g.id) || null,
    }))
  }
}
