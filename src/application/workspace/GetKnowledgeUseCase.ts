import type { WorkspaceRepository } from '../../domain/workspace/repository.js'
import type { ConversationRepository } from '../../domain/conversation/repository.js'
import type { EmbeddingServiceFactory } from '../ports/EmbeddingServiceFactory.js'
import { safeJsonParse } from '../../shared/json.js'

interface KnowledgeGapItem { topic: string; [key: string]: unknown }

export class GetKnowledgeUseCase {
  constructor(
    private readonly workspaceRepo: WorkspaceRepository,
    private readonly conversationRepo: ConversationRepository,
    private readonly embeddingFactory?: EmbeddingServiceFactory,
  ) {}

  async execute(workspaceId: string) {
    const [knowledge, gapRows] = await Promise.all([
      this.workspaceRepo.findKnowledge(workspaceId),
      this.conversationRepo.getKnowledgeGapsByWorkspace(workspaceId, 20),
    ])

    const gaps: Array<KnowledgeGapItem & { conversation_id: string; user_name: string | null; timestamp: string | null }> = []
    for (const r of gapRows) {
      const parsed: KnowledgeGapItem[] = typeof r.knowledge_gaps === 'string' ? safeJsonParse<KnowledgeGapItem[]>(r.knowledge_gaps, []) : (r.knowledge_gaps || [])
      for (const g of parsed) {
        gaps.push({ ...g, conversation_id: r.conversation_id, user_name: r.user_name, timestamp: r.last_activity_at })
      }
    }

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
