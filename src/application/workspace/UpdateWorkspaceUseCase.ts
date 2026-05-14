import type { WorkspaceRepository } from '../../domain/workspace/repository.js'
import { NotFoundError } from '../../domain/shared/errors.js'

interface UpdateWorkspaceInput {
  name?: string
  model?: string
  provider_type?: string | null
  system_prompt?: string
  cold_timeout_minutes?: number | null
  close_timeout_minutes?: number | null
}

export class UpdateWorkspaceUseCase {
  constructor(private readonly workspaceRepo: WorkspaceRepository) {}

  async execute(workspaceId: string, input: UpdateWorkspaceInput): Promise<void> {
    const exists = await this.workspaceRepo.existsById(workspaceId)
    if (!exists) throw new NotFoundError('Workspace', workspaceId)

    await this.workspaceRepo.update(workspaceId, input)
  }
}
