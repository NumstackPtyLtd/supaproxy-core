import type { WorkspaceRepository } from '../../domain/workspace/repository.js'

export class DeleteKnowledgeSourceUseCase {
  constructor(private readonly workspaceRepo: WorkspaceRepository) {}

  async execute(sourceId: string): Promise<void> {
    await this.workspaceRepo.deleteKnowledgeSource(sourceId)
  }
}
