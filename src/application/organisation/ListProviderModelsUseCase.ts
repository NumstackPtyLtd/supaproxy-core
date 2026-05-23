import { ValidationError } from '../../domain/shared/errors.js'
import pino from 'pino'

const log = pino({ name: 'list-provider-models' })

type ProviderRegistry = { get(type: string): { listModels?: (apiKey: string) => Promise<unknown[]> } | undefined }

export class ListProviderModelsUseCase {
  constructor(private readonly providerRegistry: ProviderRegistry) {}

  async execute(type: string, apiKey: string): Promise<unknown[]> {
    const provider = this.providerRegistry.get(type)
    if (!provider) throw new ValidationError('unknown_provider_type')
    if (!provider.listModels) throw new ValidationError('provider_no_model_list')

    try {
      return await provider.listModels(apiKey)
    } catch (err) {
      log.error({ err, type }, 'Provider model list failed')
      throw new ValidationError('provider_model_list_failed')
    }
  }
}
