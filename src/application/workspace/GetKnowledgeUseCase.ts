import type { WorkspaceRepository } from '../../domain/workspace/repository.js'
import type { ConversationQueryRepository } from '../../domain/conversation/queryRepository.js'
import type { EmbeddingServiceFactory } from '../ports/EmbeddingServiceFactory.js'
import { parseKnowledgeGaps } from '../../domain/shared/jsonMappers.js'
import { DEFAULT_KNOWLEDGE_GAPS_LIMIT } from '../../defaults.js'

export class GetKnowledgeUseCase {
  constructor(
    private readonly workspaceRepo: WorkspaceRepository,
    private readonly conversationQueryRepo: ConversationQueryRepository,
    private readonly embeddingFactory?: EmbeddingServiceFactory,
  ) {}

  async execute(workspaceId: string) {
    const [knowledge, gapRows] = await Promise.all([
      this.workspaceRepo.findKnowledge(workspaceId),
      this.conversationQueryRepo.getKnowledgeGapsByWorkspace(workspaceId, DEFAULT_KNOWLEDGE_GAPS_LIMIT),
    ])

    const gaps = gapRows.flatMap(r =>
      parseKnowledgeGaps(r.knowledge_gaps).map(g => ({
        ...g, conversation_id: r.conversation_id, user_name: r.user_name, timestamp: r.last_activity_at,
      }))
    )

    // Check if embedding is available for this workspace's org
    let embeddingAvailable = false
    if (this.embeddingFactory) {
      const workspace = await this.workspaceRepo.findById(workspaceId)
      if (workspace?.org_id) {
        const svc = await this.embeddingFactory.forOrg(workspace.org_id)
        embeddingAvailable = svc !== null
      }
    }

    return { knowledge, gaps, embeddingAvailable }
  }
}
