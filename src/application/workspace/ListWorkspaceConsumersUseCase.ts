import type { WorkspaceRepository, ConsumerData } from '../../domain/workspace/repository.js'

export class ListWorkspaceConsumersUseCase {
  constructor(private readonly workspaceRepo: WorkspaceRepository) {}

  async execute(workspaceId: string): Promise<ConsumerData[]> {
    return this.workspaceRepo.findConsumers(workspaceId)
  }
}
