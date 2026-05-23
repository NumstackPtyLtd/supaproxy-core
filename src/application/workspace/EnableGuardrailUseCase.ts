import type { WorkspaceRepository } from '../../domain/workspace/repository.js'
import { generateId } from '../../domain/shared/EntityId.js'

export class EnableGuardrailUseCase {
  constructor(private readonly workspaceRepo: WorkspaceRepository) {}

  async execute(workspaceId: string, guardrailId: string, config?: string): Promise<void> {
    await this.workspaceRepo.enableGuardrail(generateId(), workspaceId, guardrailId, config)
  }
}
