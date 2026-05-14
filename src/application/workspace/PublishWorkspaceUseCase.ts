import type { WorkspaceRepository } from '../../domain/workspace/repository.js'
import { NotFoundError, ValidationError } from '../../domain/shared/errors.js'
import { DEFAULT_WORKSPACE_NAME } from '../../defaults.js'

export class PublishWorkspaceUseCase {
  constructor(private readonly workspaceRepo: WorkspaceRepository) {}

  async execute(workspaceId: string, publish: boolean): Promise<void> {
    const ws = await this.workspaceRepo.findById(workspaceId)
    if (!ws) throw new NotFoundError('Workspace', workspaceId)

    if (!publish && ws.name === DEFAULT_WORKSPACE_NAME) {
      throw new ValidationError('The #general workspace cannot be unpublished.')
    }

    if (publish) {
      await this.workspaceRepo.setDefault(workspaceId)
    } else {
      await this.workspaceRepo.unsetDefault(workspaceId)
    }
  }
}
