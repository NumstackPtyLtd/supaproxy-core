import type { OrganisationRepository } from '../../domain/organisation/repository.js'
import type { WorkspaceRepository } from '../../domain/workspace/repository.js'
import type { registry as ProviderRegistryType } from '@supaproxy/providers'

interface HealthOutput {
  status: 'ok'
  setup_complete?: boolean
  workspaces?: number
  ai_configured?: boolean
  embedding_available?: boolean
  connections?: number
  consumers?: number
}

export class GetHealthUseCase {
  constructor(
    private readonly orgRepo: OrganisationRepository,
    private readonly workspaceRepo: WorkspaceRepository,
    private readonly providerRegistry?: typeof ProviderRegistryType,
  ) {}

  async executePublic(): Promise<HealthOutput> {
    return { status: 'ok' }
  }

  async executeAuthenticated(): Promise<HealthOutput> {
    // Check all registered provider types for API keys
    const providerTypes = this.providerRegistry?.types() || ['anthropic', 'openai']
    let aiConfigured = false
    let embeddingAvailable = false

    // Check general fallback key first
    const generalKey = await this.orgRepo.getSettingValue('ai_api_key')
    if (generalKey) aiConfigured = true

    // Check provider-specific keys
    for (const type of providerTypes) {
      const key = await this.orgRepo.getSettingValue(`${type}_api_key`)
      if (key) {
        aiConfigured = true
        // Check if this provider supports embedding
        const provider = this.providerRegistry?.get(type)
        if (provider?.supportsEmbedding) embeddingAvailable = true
      }
    }

    // General key also enables embedding if an embedding provider exists
    if (generalKey && !embeddingAvailable) {
      const providers = this.providerRegistry?.list() || []
      if (providers.some(p => p.supportsEmbedding)) embeddingAvailable = true
    }

    const workspaceCount = await this.workspaceRepo.getActiveWorkspaceCount()
    const connectionCount = await this.workspaceRepo.getConnectedConnectionCount()
    const consumerCount = await this.workspaceRepo.getActiveConsumerCount()

    return {
      status: 'ok',
      setup_complete: workspaceCount > 0,
      workspaces: workspaceCount,
      ai_configured: aiConfigured,
      embedding_available: embeddingAvailable,
      connections: connectionCount,
      consumers: consumerCount,
    }
  }
}
