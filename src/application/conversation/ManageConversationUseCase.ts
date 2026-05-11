import type { ConversationRepository } from '../../domain/conversation/repository.js'
import { generateId } from '../../domain/shared/EntityId.js'

export class ManageConversationUseCase {
  constructor(private readonly conversationRepo: ConversationRepository) {}

  async findOrCreate(workspaceId: string, consumerType: string, externalThreadId: string, userName?: string, channel?: string): Promise<string> {
    const existing = await this.conversationRepo.findLatestByThread(workspaceId, consumerType, externalThreadId)

    if (existing) {
      if (existing.status === 'open' || existing.status === 'cold') {
        if (existing.status === 'cold') {
          await this.conversationRepo.reopenFromCold(existing.id)
        }
        return existing.id
      }
      // Closed - create follow-up
      const newId = generateId()
      await this.conversationRepo.create({
        id: newId,
        workspaceId,
        consumerType,
        externalThreadId,
        userName,
        channel,
        parentId: existing.id,
      })
      return newId
    }

    const newId = generateId()
    await this.conversationRepo.create({
      id: newId,
      workspaceId,
      consumerType,
      externalThreadId,
      userName,
      channel,
    })
    return newId
  }

  async recordMessage(conversationId: string, role: 'user' | 'assistant', content: string, auditLogId?: string): Promise<void> {
    const seq = await this.conversationRepo.getNextSeq(conversationId)
    await this.conversationRepo.recordMessage(generateId(), conversationId, role, content, seq, auditLogId)
    await this.conversationRepo.incrementMessageCount(conversationId)
  }

  async getHistory(conversationId: string): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
    return this.conversationRepo.findMessages(conversationId)
  }

  async setRouting(conversationId: string, routedFrom: string, routedTo: string, routeReason: string): Promise<void> {
    await this.conversationRepo.updateRouting(conversationId, routedFrom, routedTo, routeReason)
  }
}
