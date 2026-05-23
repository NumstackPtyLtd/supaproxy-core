import type { OrganisationRepository } from '../../domain/organisation/repository.js'
import type { OAuthCredentialPort } from './OAuthCredentialService.js'
import type { OAuthHttpClient } from '../ports/OAuthHttpClient.js'
import { generateId } from '../../domain/shared/EntityId.js'
import { NotFoundError, ConfigurationError } from '../../domain/shared/errors.js'
import pino from 'pino'

const log = pino({ name: 'exchange-oauth-code' })

export interface ExchangeResult {
  pluginId: string
  redirectUrl: string
}

export class ExchangeOAuthCodeUseCase {
  constructor(
    private readonly orgRepo: OrganisationRepository,
    private readonly credentialPort: OAuthCredentialPort,
    private readonly oauthHttp: OAuthHttpClient,
    private readonly dashboardUrl: string,
  ) {}

  async execute(code: string, state: string): Promise<ExchangeResult> {
    const pluginId = state.split(':')[0] || null
    if (!pluginId) throw new NotFoundError('Plugin', state)

    const config = await this.credentialPort.resolveOAuthConfig(pluginId)
    if (!config) throw new NotFoundError('Plugin', pluginId)

    const orgId = await this.orgRepo.getFirstOrgId()
    if (!orgId) throw new ConfigurationError('No organisation configured')

    const credentials = await this.credentialPort.resolveCredentials(orgId, pluginId)
    if (!credentials) throw new ConfigurationError('No OAuth credentials configured')

    const tokens = await this.oauthHttp.exchangeToken({
      tokenUrl: config.tokenUrl,
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
      grantType: 'authorization_code',
      code,
      redirectUri: `${this.dashboardUrl}/oauth/callback`,
    })

    await this.storeTokens(orgId, pluginId, tokens)

    if (config.resourcesUrl) {
      await this.discoverResources(orgId, pluginId, config.resourcesUrl, tokens.access_token)
    }

    log.info({ pluginId }, 'OAuth connection established')
    return { pluginId, redirectUrl: `${this.dashboardUrl}/settings?oauth=success&plugin=${pluginId}` }
  }

  private async storeTokens(orgId: string, pluginId: string, tokens: { access_token: string; refresh_token?: string }): Promise<void> {
    await this.orgRepo.upsertSetting(generateId(), orgId, `${pluginId}_access_token`, tokens.access_token, true)
    if (tokens.refresh_token) {
      await this.orgRepo.upsertSetting(generateId(), orgId, `${pluginId}_refresh_token`, tokens.refresh_token, true)
    }
  }

  private async discoverResources(orgId: string, pluginId: string, resourcesUrl: string, accessToken: string): Promise<void> {
    const resources = await this.oauthHttp.discoverResources(resourcesUrl, accessToken)
    if (resources.length > 0) {
      await this.orgRepo.upsertSetting(generateId(), orgId, `${pluginId}_resource_id`, resources[0].id, false)
      await this.orgRepo.upsertSetting(generateId(), orgId, `${pluginId}_resource_url`, resources[0].url || resources[0].name, false)
    }
  }
}
