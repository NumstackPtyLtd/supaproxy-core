import OpenAI from 'openai';
import type { EmbeddingService } from '../../application/ports/EmbeddingService.js';

/**
 * Embedding service that uses OpenAI-compatible embedding APIs.
 * Works with OpenAI, Azure OpenAI, and any provider exposing the same endpoint.
 * Uses text-embedding-3-small (1536 dimensions) by default.
 */
export class ProviderEmbeddingService implements EmbeddingService {
  private client: OpenAI;
  private model: string;
  private dims: number;

  constructor(apiKey: string, model = 'text-embedding-3-small', dims = 1536) {
    this.client = new OpenAI({ apiKey });
    this.model = model;
    this.dims = dims;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const response = await this.client.embeddings.create({
      model: this.model,
      input: texts,
      dimensions: this.dims,
    });

    return response.data
      .sort((a, b) => a.index - b.index)
      .map(d => d.embedding);
  }

  dimensions(): number {
    return this.dims;
  }
}
