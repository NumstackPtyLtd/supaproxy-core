import type { WorkspaceRepository } from '../../domain/workspace/repository.js'
import { generateId } from '../../domain/shared/EntityId.js'
import { NotFoundError, ConflictError } from '../../domain/shared/errors.js'
import { STATUS_SAVED } from '../../defaults.js'

interface BindChannelInput {
  type: string
  workspaceId: string
  channelId: string
  channelName?: string
}

export class BindConsumerChannelUseCase {
  constructor(private readonly workspaceRepo: WorkspaceRepository) {}

  async execute(input: BindChannelInput): Promise<{ status: string; message: string }> {
    const exists = await this.workspaceRepo.existsById(input.workspaceId)
    if (!exists) throw new NotFoundError('Workspace', input.workspaceId)

    const bound = await this.workspaceRepo.findConsumerBoundToChannel(input.type, input.workspaceId, input.channelId)
    if (bound) {
      throw new ConflictError(`This channel is already bound to "${bound.workspace_name}". A channel can only belong to one workspace.`)
    }

    const config = JSON.stringify({
      channels: [input.channelId],
      channel_name: input.channelName || `#${input.channelId}`,
      allow_dms: true,
      thread_context: true,
    })

    const existing = await this.workspaceRepo.findConsumerByType(input.workspaceId, input.type)
    if (existing) {
      await this.workspaceRepo.updateConsumerConfig(existing.id, config)
    } else {
      await this.workspaceRepo.createConsumer(generateId(), input.workspaceId, input.type, config)
    }

    return { status: STATUS_SAVED, message: `Channel ${input.channelName || input.channelId} bound to this workspace.` }
  }
}
