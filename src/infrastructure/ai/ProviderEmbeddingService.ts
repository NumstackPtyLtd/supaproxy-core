import type { EmbeddingService } from '../../application/ports/EmbeddingService.js';
import { DEFAULT_EMBEDDING_DIMENSIONS } from '../../defaults.js';

/**
 * Embedding service that uses any OpenAI-compatible embedding API.
 * Provider-agnostic: works with any service exposing the /v1/embeddings endpoint.
 * The provider and model are configured per org, not hardcoded.
 */
export class ProviderEmbeddingService implements EmbeddingService {
  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private dims: number;

  constructor(config: { apiKey: string; baseUrl?: string; model?: string; dimensions?: number }) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
    this.model = config.model || 'text-embedding-3-small';
    this.dims = config.dimensions || DEFAULT_EMBEDDING_DIMENSIONS;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
        dimensions: this.dims,
      }),
    });

    if (!response.ok) {
      const err = await response.text().catch(() => 'Unknown error');
      throw new Error(`Embedding API error (${response.status}): ${err}`);
    }

    const result = await response.json() as { data: Array<{ index: number; embedding: number[] }> };

    return result.data
      .sort((a, b) => a.index - b.index)
      .map(d => d.embedding);
  }

  dimensions(): number {
    return this.dims;
  }
}
