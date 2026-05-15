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

  /**
   * Format retrieved chunks into a context string for the prompt.
   */
  static formatContext(chunks: VectorSearchResult[]): string {
    if (chunks.length === 0) return '';

    const lines = chunks.map((c, i) => {
      const source = c.metadata?.source_name || 'Knowledge base';
      return `[${i + 1}] (${source}) ${c.text}`;
    });

    return `\n\n<knowledge_context>\nThe following information was retrieved from the workspace knowledge base. Use it to inform your response where relevant.\n\n${lines.join('\n\n')}\n</knowledge_context>`;
  }
}
