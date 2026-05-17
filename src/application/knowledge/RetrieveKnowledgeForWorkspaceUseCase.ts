import type { VectorStore, VectorSearchResult } from '../ports/VectorStore.js';
import type { WorkspaceRepository } from '../../domain/workspace/repository.js';
import type { EmbeddingServiceFactory } from '../../infrastructure/ai/EmbeddingServiceFactory.js';
import { RetrieveKnowledgeUseCase } from './RetrieveKnowledgeUseCase.js';
import pino from 'pino';

const log = pino({ name: 'retrieve-knowledge' });

/**
 * Workspace-aware wrapper that resolves the embedding service from the org's API key.
 * Used by ExecuteQueryUseCase at query time.
 */
export class RetrieveKnowledgeForWorkspaceUseCase {
  constructor(
    private readonly vectorStore: VectorStore,
    private readonly workspaceRepo: WorkspaceRepository,
    private readonly embeddingFactory: EmbeddingServiceFactory,
  ) {}

  async execute(workspaceId: string, query: string, limit = 5): Promise<{ chunks: VectorSearchResult[]; query: string }> {
    const workspace = await this.workspaceRepo.findById(workspaceId);
    if (!workspace?.org_id) return { chunks: [], query };

    const embeddingService = await this.embeddingFactory.forOrg(workspace.org_id);
    if (!embeddingService) {
      log.debug({ workspaceId }, 'No embedding API key configured, skipping knowledge retrieval');
      return { chunks: [], query };
    }

    const useCase = new RetrieveKnowledgeUseCase(this.vectorStore, embeddingService);
    return useCase.execute(workspaceId, query, limit);
  }
}
