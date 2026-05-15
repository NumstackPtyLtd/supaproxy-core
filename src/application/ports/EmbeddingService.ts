/**
 * Port: converts text into vector embeddings.
 * Implemented by the org's configured AI provider.
 */
export interface EmbeddingService {
  embed(texts: string[]): Promise<number[][]>;
  dimensions(): number;
}
