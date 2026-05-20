import type { OrganisationRepository } from '../../domain/organisation/repository.js'
import type { ProviderPlugin } from '@supaproxy/providers'
import type { registry as ProviderRegistryType } from '@supaproxy/providers'
import { ConfigurationError } from '../../domain/shared/errors.js'

export interface ResolvedProvider {
  provider: ProviderPlugin
  apiKey: string
}

export async function resolveProvider(
  orgRepo: OrganisationRepository,
  providerRegistry: typeof ProviderRegistryType,
  workspaceProviderType: string | null,
): Promise<ResolvedProvider> {
  // Step 1: resolve which provider type to use (workspace override > org default)
  const orgSettings = await orgRepo.getSettingValues(['ai_provider_type'])
  const providerType = workspaceProviderType || orgSettings['ai_provider_type']
  if (!providerType) throw new ConfigurationError('No AI provider configured')

  // Step 2: fetch API key using prefixed key (anthropic_api_key, openai_api_key)
  // Fall back to legacy ai_api_key for backward compatibility
  const keySettings = await orgRepo.getSettingValues([`${providerType}_api_key`, 'ai_api_key'])
  const apiKey = keySettings[`${providerType}_api_key`] || keySettings['ai_api_key'] || null
  if (!apiKey) throw new ConfigurationError('No AI API key configured')

  const provider = providerRegistry.get(providerType)
  return { provider, apiKey }
}
