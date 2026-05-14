import type { WorkspaceRepository } from '../../domain/workspace/repository.js'
import { NotFoundError } from '../../domain/shared/errors.js'

export class PublishWorkspaceUseCase {
  constructor(private readonly workspaceRepo: WorkspaceRepository) {}

  async execute(workspaceId: string, publish: boolean): Promise<void> {
    const ws = await this.workspaceRepo.findById(workspaceId)
    if (!ws) throw new NotFoundError('Workspace', workspaceId)

    if (publish) {
      await this.workspaceRepo.setDefault(workspaceId)
    } else {
      await this.workspaceRepo.unsetDefault(workspaceId)
    }
  }
}
