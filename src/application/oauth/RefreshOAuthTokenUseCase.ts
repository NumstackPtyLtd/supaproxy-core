import type { OrganisationRepository } from '../../domain/organisation/repository.js'
import type { OAuthCredentialPort } from './OAuthCredentialService.js'
import type { OAuthHttpClient } from '../ports/OAuthHttpClient.js'
import { generateId } from '../../domain/shared/EntityId.js'
import { NotFoundError, ConfigurationError } from '../../domain/shared/errors.js'
import pino from 'pino'

const log = pino({ name: 'refresh-oauth-token' })

export class RefreshOAuthTokenUseCase {
  constructor(
    private readonly orgRepo: OrganisationRepository,
    private readonly credentialPort: OAuthCredentialPort,
    private readonly oauthHttp: OAuthHttpClient,
  ) {}

  async execute(pluginId: string): Promise<{ refreshed: boolean }> {
    const config = await this.credentialPort.resolveOAuthConfig(pluginId)
    if (!config) throw new NotFoundError('Plugin', pluginId)

    const orgId = await this.orgRepo.getFirstOrgId()
    if (!orgId) throw new ConfigurationError('No organisation configured')

    const refreshToken = await this.orgRepo.findSetting(orgId, `${pluginId}_refresh_token`)
    if (!refreshToken?.value) throw new ConfigurationError('No refresh token available')

    const credentials = await this.credentialPort.resolveCredentials(orgId, pluginId)
    if (!credentials) throw new ConfigurationError('No OAuth credentials configured')

    const tokens = await this.oauthHttp.exchangeToken({
      tokenUrl: config.tokenUrl,
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
      grantType: 'refresh_token',
      refreshToken: refreshToken.value,
    })

    await this.orgRepo.upsertSetting(generateId(), orgId, `${pluginId}_access_token`, tokens.access_token, true)
    if (tokens.refresh_token) {
      await this.orgRepo.upsertSetting(generateId(), orgId, `${pluginId}_refresh_token`, tokens.refresh_token, true)
    }

    log.info({ pluginId }, 'OAuth token refreshed')
    return { refreshed: true }
  }
}
