import type { OrganisationRepository } from '../../domain/organisation/repository.js';
import type { EmbeddingService } from '../../application/ports/EmbeddingService.js';
import { ProviderEmbeddingService } from './ProviderEmbeddingService.js';

/**
 * Resolves an EmbeddingService for an org using its stored API key.
 * Looks for openai_api_key first (required for embeddings), falls back to ai_api_key.
 */
export class EmbeddingServiceFactory {
  constructor(private readonly orgRepo: OrganisationRepository) {}

  async forOrg(orgId: string): Promise<EmbeddingService | null> {
    const settings = await this.orgRepo.findSettings(orgId);
    const apiKey = settings.find(s => s.key === 'openai_api_key')?.value
      || settings.find(s => s.key === 'ai_api_key')?.value;

    if (!apiKey) return null;

    return new ProviderEmbeddingService(apiKey);
  }
}
