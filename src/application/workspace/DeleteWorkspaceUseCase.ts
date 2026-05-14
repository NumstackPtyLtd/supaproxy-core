import type { WorkspaceRepository } from '../../domain/workspace/repository.js'
import { NotFoundError, ValidationError } from '../../domain/shared/errors.js'

export class DeleteWorkspaceUseCase {
  constructor(private readonly workspaceRepo: WorkspaceRepository) {}

  async execute(workspaceId: string): Promise<void> {
    const ws = await this.workspaceRepo.findById(workspaceId)
    if (!ws) throw new NotFoundError('Workspace', workspaceId)
    if (ws.is_default) throw new ValidationError('Cannot delete a published workspace. Unpublish it first.')

    await this.workspaceRepo.deleteWorkspace(workspaceId)
  }
}
