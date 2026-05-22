import type { WorkspaceRepository } from '../../domain/workspace/repository.js'
import { Workspace } from '../../domain/workspace/Workspace.js'
import { NotFoundError, ValidationError } from '../../domain/shared/errors.js'

export class DeleteWorkspaceUseCase {
  constructor(private readonly workspaceRepo: WorkspaceRepository) {}

  async execute(workspaceId: string): Promise<void> {
    const data = await this.workspaceRepo.findById(workspaceId)
    if (!data) throw new NotFoundError('Workspace', workspaceId)

    const ws = Workspace.fromData(data)
    if (!ws.canDelete()) throw new ValidationError('Cannot delete a published workspace. Unpublish it first.')

    await this.workspaceRepo.deleteWorkspace(workspaceId)
  }
}
