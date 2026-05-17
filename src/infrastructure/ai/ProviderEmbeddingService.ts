import type { EmbeddingService } from '../../application/ports/EmbeddingService.js';
import type { ProviderPlugin } from '@supaproxy/providers';
import { DEFAULT_EMBEDDING_DIMENSIONS } from '../../defaults.js';

/**
 * Embedding service backed by a provider plugin's embed() method.
 * Provider-agnostic: works with any provider that supports embedding.
 */
export class ProviderEmbeddingService implements EmbeddingService {
  constructor(
    private readonly provider: ProviderPlugin,
    private readonly apiKey: string,
    private readonly model?: string,
    private readonly dims: number = DEFAULT_EMBEDDING_DIMENSIONS,
  ) {}

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    if (!this.provider.embed) throw new Error(`Provider ${this.provider.type} does not support embedding`);

    const response = await this.provider.embed({
      apiKey: this.apiKey,
      model: this.model,
      input: texts,
      dimensions: this.dims,
    });

    return response.embeddings;
  }

  dimensions(): number {
    return this.dims;
  }
}
