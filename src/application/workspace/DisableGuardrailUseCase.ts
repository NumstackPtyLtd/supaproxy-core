import type { WorkspaceRepository } from '../../domain/workspace/repository.js'

export class DisableGuardrailUseCase {
  constructor(private readonly workspaceRepo: WorkspaceRepository) {}

  async execute(workspaceId: string, guardrailId: string): Promise<void> {
    await this.workspaceRepo.disableGuardrail(workspaceId, guardrailId)
  }
}
