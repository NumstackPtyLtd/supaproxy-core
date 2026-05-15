import type { KnowledgeChunkRepository } from '../../domain/knowledge/repository.js';
import type { VectorStore } from '../ports/VectorStore.js';
import type { WorkspaceRepository } from '../../domain/workspace/repository.js';
import type { EmbeddingServiceFactory } from '../../infrastructure/ai/EmbeddingServiceFactory.js';
import { IndexKnowledgeUseCase } from './IndexKnowledgeUseCase.js';
import { ConfigurationError } from '../../domain/shared/errors.js';

interface IndexInput {
  sourceId: string;
  workspaceId: string;
  type: string;
  name: string;
  content: string;
}

/**
 * Workspace-aware wrapper that resolves the embedding service from the org's API key.
 */
export class IndexKnowledgeForWorkspaceUseCase {
  constructor(
    private readonly chunkRepo: KnowledgeChunkRepository,
    private readonly vectorStore: VectorStore,
    private readonly workspaceRepo: WorkspaceRepository,
    private readonly embeddingFactory: EmbeddingServiceFactory,
  ) {}

  async execute(input: IndexInput): Promise<{ sourceId: string; chunksIndexed: number }> {
    const workspace = await this.workspaceRepo.findById(input.workspaceId);
    if (!workspace?.org_id) throw new ConfigurationError('Workspace has no organisation');

    const embeddingService = await this.embeddingFactory.forOrg(workspace.org_id);
    if (!embeddingService) throw new ConfigurationError('No embedding API key configured. Set openai_api_key or ai_api_key in organisation settings.');

    const useCase = new IndexKnowledgeUseCase(this.chunkRepo, this.vectorStore, embeddingService);
    return useCase.execute({
      id: input.sourceId,
      workspaceId: input.workspaceId,
      type: input.type,
      name: input.name,
      content: input.content,
    });
  }
}
