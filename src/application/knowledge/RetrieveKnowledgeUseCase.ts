import type { EmbeddingService } from '../ports/EmbeddingService.js';
import type { VectorStore, VectorSearchResult } from '../ports/VectorStore.js';

import { DEFAULT_RETRIEVAL_LIMIT, DEFAULT_RETRIEVAL_MIN_SCORE } from '../../defaults.js';

export interface RetrievalResult {
  chunks: VectorSearchResult[];
  query: string;
}

export class RetrieveKnowledgeUseCase {
  constructor(
    private vectorStore: VectorStore,
    private embeddingService: EmbeddingService,
  ) {}

  async execute(workspaceId: string, query: string, limit = DEFAULT_RETRIEVAL_LIMIT): Promise<RetrievalResult> {
    const [queryVector] = await this.embeddingService.embed([query]);
    if (!queryVector) return { chunks: [], query };

    const results = await this.vectorStore.search(workspaceId, queryVector, limit);

    // Filter by minimum relevance score
    const relevant = results.filter(r => r.score >= DEFAULT_RETRIEVAL_MIN_SCORE);

    return { chunks: relevant, query };
  }
}
