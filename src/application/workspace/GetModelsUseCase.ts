import type { ModelRepository, ModelData } from '../ports/ModelRepository.js'
import type { OrganisationRepository } from '../../domain/organisation/repository.js'
import type { registry as ProviderRegistryType } from '@supaproxy/providers'

export class GetModelsUseCase {
  constructor(
    private readonly modelRepo: ModelRepository,
    private readonly orgRepo: OrganisationRepository,
    private readonly providerRegistry?: typeof ProviderRegistryType,
  ) {}

  async execute() {
    const defaultModel = await this.orgRepo.getSettingValue('default_model')

    // Get models from the provider registry (always up to date)
    const registryModels: ModelData[] = []
    if (this.providerRegistry) {
      for (const plugin of this.providerRegistry.list()) {
        for (const model of plugin.models) {
          registryModels.push({
            id: model.id,
            label: model.label,
            is_default: model.default || false,
            provider: plugin.type,
          })
        }
      }
    }

    // Merge with DB models (for any custom/overridden models)
    const dbModels = await this.modelRepo.listAll()
    const seen = new Set(registryModels.map(m => m.id))
    for (const m of dbModels) {
      if (!seen.has(m.id)) {
        registryModels.push(m)
      }
    }

    return registryModels.map(r => ({
      ...r,
      is_default: r.id === defaultModel || r.is_default,
    }))
  }
}
