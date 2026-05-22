import type { ConversationRepository } from '../../domain/conversation/repository.js'
import type { QueueService } from '../ports/QueueService.js'
import { Conversation } from '../../domain/conversation/Conversation.js'
import { generateId } from '../../domain/shared/EntityId.js'
import { NotFoundError } from '../../domain/shared/errors.js'
import { StatsStatus } from '../../domain/conversation/StatsStatus.js'
import { QUEUE_CONVERSATION_STATS } from '../../defaults.js'

export class CloseConversationUseCase {
  constructor(
    private readonly conversationRepo: ConversationRepository,
    private readonly queueService: QueueService,
  ) {}

  async execute(conversationId: string): Promise<void> {
    const data = await this.conversationRepo.findById(conversationId)
    if (!data) throw new NotFoundError('Conversation', conversationId)

    const conversation = Conversation.fromData(data)
    if (!conversation.isClosed()) {
      await this.conversationRepo.closeConversation(conversationId)
    }

    const existingStats = await this.conversationRepo.findStats(conversationId)
    if (existingStats) {
      if (existingStats.stats_status !== StatsStatus.COMPLETE) {
        await this.conversationRepo.updateStatsStatus(existingStats.id, StatsStatus.PENDING)
      }
    } else {
      await this.conversationRepo.createStats(generateId(), conversationId)
    }

    await this.queueService.addJob(QUEUE_CONVERSATION_STATS, 'generate-stats', { conversationId })
  }
}
