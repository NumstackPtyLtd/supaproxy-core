import type { EmbeddingService } from './EmbeddingService.js';

/**
 * Resolves an EmbeddingService for an org using its configured provider.
 * Implemented by infrastructure (e.g. ProviderEmbeddingServiceFactory).
 */
export interface EmbeddingServiceFactory {
  forOrg(orgId: string): Promise<EmbeddingService | null>;
}
