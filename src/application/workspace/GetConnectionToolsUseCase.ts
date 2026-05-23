import type { WorkspaceRepository } from '../../domain/workspace/repository.js'

export class GetConnectionToolsUseCase {
  constructor(private readonly workspaceRepo: WorkspaceRepository) {}

  async execute(connectionId: string) {
    const tools = await this.workspaceRepo.findToolsByConnectionId(connectionId)
    return { tools }
  }
}
