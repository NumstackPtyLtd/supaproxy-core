import type { GuardrailPolicyRepository } from '../../domain/guardrail/policyRepository.js'
import { generateId } from '../../domain/shared/EntityId.js'
import { ValidationError, NotFoundError, ConflictError } from '../../domain/shared/errors.js'

interface CreateOverrideInput {
  orgId: string
  pluginId: string
  workspaceId: string
  justification: string
  userId: string
}

export class CreatePolicyOverrideUseCase {
  constructor(private readonly policyRepo: GuardrailPolicyRepository) {}

  async execute(input: CreateOverrideInput): Promise<void> {
    const { orgId, pluginId, workspaceId, justification, userId } = input

    if (!justification.trim()) {
      throw new ValidationError('A justification is required to override a recommended policy')
    }

    const policy = await this.policyRepo.findByOrgAndPlugin(orgId, pluginId)
    if (!policy) {
      throw new NotFoundError('GuardrailPolicy', pluginId)
    }

    if (policy.enforcement === 'mandatory') {
      throw new ValidationError('Cannot override a mandatory policy')
    }

    const existing = await this.policyRepo.findOverride(policy.id, workspaceId)
    if (existing) {
      throw new ConflictError('An override for this policy and workspace already exists')
    }

    await this.policyRepo.createOverride({
      id: generateId(),
      policy_id: policy.id,
      workspace_id: workspaceId,
      justification: justification.trim(),
      created_by: userId,
    })
  }
}
