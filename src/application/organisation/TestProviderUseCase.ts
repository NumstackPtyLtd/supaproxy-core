import { ValidationError } from '../../domain/shared/errors.js'
import pino from 'pino'

const log = pino({ name: 'test-provider' })

type TestResult = { ok: boolean; chat: boolean; embedding: boolean; error?: string }

type ProviderRegistry = { get(type: string): { testConnection?: (apiKey: string) => Promise<TestResult> } | undefined }

export class TestProviderUseCase {
  constructor(private readonly providerRegistry: ProviderRegistry) {}

  async execute(type: string, apiKey: string): Promise<TestResult> {
    const provider = this.providerRegistry.get(type)
    if (!provider) throw new ValidationError('unknown_provider_type')
    if (!provider.testConnection) throw new ValidationError('provider_no_connection_test')

    try {
      return await provider.testConnection(apiKey)
    } catch (err) {
      log.error({ err, type }, 'Provider connection test failed')
      return { ok: false, chat: false, embedding: false, error: 'provider_test_failed' }
    }
  }
}
