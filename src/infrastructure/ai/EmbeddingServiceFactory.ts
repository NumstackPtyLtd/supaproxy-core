import type { OrganisationRepository } from '../../domain/organisation/repository.js';
import type { EmbeddingService } from '../../application/ports/EmbeddingService.js';
import { ProviderEmbeddingService } from './ProviderEmbeddingService.js';

/**
 * Resolves an EmbeddingService for an org using its stored configuration.
 * Looks for embedding-specific settings first, falls back to the general AI API key.
 * Provider-agnostic: base URL and model are configurable per org.
 */
export class EmbeddingServiceFactory {
  constructor(private readonly orgRepo: OrganisationRepository) {}

  async forOrg(orgId: string): Promise<EmbeddingService | null> {
    const apiKeySetting = await this.orgRepo.findSetting(orgId, 'embedding_api_key')
      || await this.orgRepo.findSetting(orgId, 'ai_api_key');

    if (!apiKeySetting?.value) return null;

    const baseUrl = await this.orgRepo.findSetting(orgId, 'embedding_base_url');
    const model = await this.orgRepo.findSetting(orgId, 'embedding_model');
    const dims = await this.orgRepo.findSetting(orgId, 'embedding_dimensions');

    return new ProviderEmbeddingService({
      apiKey: apiKeySetting.value,
      baseUrl: baseUrl?.value || undefined,
      model: model?.value || undefined,
      dimensions: dims?.value ? parseInt(dims.value, 10) : undefined,
    });
  }
}
