import type { ConversationQueryRepository } from '../../domain/conversation/queryRepository.js'

export class ListConversationsUseCase {
  constructor(private readonly conversationRepo: ConversationQueryRepository) {}

  async execute(workspaceId: string, filters: { status?: string; category?: string; resolution?: string; consumer?: string }, limit: number, offset: number) {
    const [result, filterValues] = await Promise.all([
      this.conversationRepo.listWithStats(workspaceId, filters, limit, offset),
      this.conversationRepo.getFilters(workspaceId),
    ])
    return { conversations: result.rows, total: result.total, filters: filterValues }
  }
}
