import type { WorkspaceRepository } from '../../domain/workspace/repository.js'
import { generateId } from '../../domain/shared/EntityId.js'
import { NotFoundError, ValidationError } from '../../domain/shared/errors.js'
import { STATUS_CONNECTED, STATUS_SAVED } from '../../defaults.js'

export interface ConsumerTypeHandler {
  buildConfig(credentials: Record<string, string>, channelId?: string, channelName?: string): string
  verifyCredentials(credentials: Record<string, string>): Promise<void>
  start?(credentials: Record<string, string>): Promise<void>
}

interface ConnectInput {
  type: string
  workspaceId: string
  credentials: Record<string, string>
  channelId?: string
}

export class ConnectConsumerUseCase {
  constructor(
    private readonly workspaceRepo: WorkspaceRepository,
    private readonly handlers: Record<string, ConsumerTypeHandler>,
  ) {}

  async execute(input: ConnectInput): Promise<{ status: string; message: string }> {
    const handler = this.handlers[input.type]
    if (!handler) throw new ValidationError(`Unsupported consumer type: ${input.type}`)

    const exists = await this.workspaceRepo.existsById(input.workspaceId)
    if (!exists) throw new NotFoundError('Workspace', input.workspaceId)

    await handler.verifyCredentials(input.credentials)

    const config = handler.buildConfig(input.credentials, input.channelId)

    const existing = await this.workspaceRepo.findConsumerByType(input.workspaceId, input.type)
    if (existing) {
      await this.workspaceRepo.updateConsumerConfig(existing.id, config)
    } else {
      await this.workspaceRepo.createConsumer(generateId(), input.workspaceId, input.type, config)
    }

    if (handler.start) {
      try {
        await handler.start(input.credentials)
        return { status: STATUS_CONNECTED, message: 'Connected. The consumer is now active.' }
      } catch (err) {
        return { status: STATUS_SAVED, message: `Credentials saved but the consumer could not start: ${(err as Error).message}. Check the credentials and try again.` }
      }
    }

    return { status: STATUS_SAVED, message: 'Consumer configured.' }
  }
}
