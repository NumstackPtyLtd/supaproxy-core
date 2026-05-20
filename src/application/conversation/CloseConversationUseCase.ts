import type { ConversationRepository } from '../../domain/conversation/repository.js'
import type { QueueService } from '../ports/QueueService.js'
import { generateId } from '../../domain/shared/EntityId.js'
import { NotFoundError } from '../../domain/shared/errors.js'
import { STATUS_CLOSED, STATUS_COMPLETE, STATUS_PENDING } from '../../defaults.js'

export class CloseConversationUseCase {
  constructor(
    private readonly conversationRepo: ConversationRepository,
    private readonly queueService: QueueService,
  ) {}

  async execute(conversationId: string): Promise<void> {
    const conversation = await this.conversationRepo.findById(conversationId)
    if (!conversation) throw new NotFoundError('Conversation', conversationId)

    if (conversation.status !== STATUS_CLOSED) {
      await this.conversationRepo.closeConversation(conversationId)
    }

    const existingStats = await this.conversationRepo.findStats(conversationId)
    if (existingStats) {
      if (existingStats.stats_status !== STATUS_COMPLETE) {
        await this.conversationRepo.updateStatsStatus(existingStats.id, STATUS_PENDING)
      }
    } else {
      await this.conversationRepo.createStats(generateId(), conversationId)
    }

    await this.queueService.addStatsJob(conversationId)
  }
}
