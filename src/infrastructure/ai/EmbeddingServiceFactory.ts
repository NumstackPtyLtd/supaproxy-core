import type { OrganisationRepository } from '../../domain/organisation/repository.js';
import type { EmbeddingService } from '../../application/ports/EmbeddingService.js';
import type { registry as ProviderRegistryType } from '@supaproxy/providers';
import { ProviderEmbeddingService } from './ProviderEmbeddingService.js';

/**
 * Resolves an EmbeddingService for an org using its configured provider.
 * Finds the first provider that supports embedding and has an API key.
 * Provider-agnostic: works with any provider plugin that implements embed().
 */
export class EmbeddingServiceFactory {
  constructor(
    private readonly orgRepo: OrganisationRepository,
    private readonly providerRegistry: typeof ProviderRegistryType,
  ) {}

  async forOrg(orgId: string): Promise<EmbeddingService | null> {
    // Find a provider that supports embedding
    const providers = this.providerRegistry.list();
    const embeddingProvider = providers.find(p => p.supportsEmbedding && p.embed);

    if (!embeddingProvider) return null;

    // Resolve the API key: provider-specific key first, then general fallback
    const providerKey = await this.orgRepo.findSetting(orgId, `${embeddingProvider.type}_api_key`);
    const fallbackKey = await this.orgRepo.findSetting(orgId, 'ai_api_key');
    const apiKey = providerKey?.value || fallbackKey?.value;

    if (!apiKey) return null;

    // Resolve optional embedding model and dimensions
    const modelSetting = await this.orgRepo.findSetting(orgId, 'embedding_model');
    const dimsSetting = await this.orgRepo.findSetting(orgId, 'embedding_dimensions');

    const defaultModel = embeddingProvider.embeddingModels?.find(m => m.default);
    const model = modelSetting?.value || defaultModel?.id;
    const dims = dimsSetting?.value ? parseInt(dimsSetting.value, 10) : defaultModel?.dimensions;

    return new ProviderEmbeddingService(embeddingProvider, apiKey, model, dims);
  }
}
