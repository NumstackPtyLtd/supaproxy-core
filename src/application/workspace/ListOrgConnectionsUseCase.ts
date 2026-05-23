import type { WorkspaceRepository } from '../../domain/workspace/repository.js'

export class ListOrgConnectionsUseCase {
  constructor(private readonly workspaceRepo: WorkspaceRepository) {}

  async execute(orgId: string, options: { search?: string; limit: number; offset: number }) {
    return this.workspaceRepo.listOrgConnections(orgId, options)
  }
}
