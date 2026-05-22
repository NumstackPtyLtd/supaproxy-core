import type { OrganisationRepository } from '../../domain/organisation/repository.js'
import type { OAuthCredentialPort } from './OAuthCredentialService.js'
import type { OAuthHttpClient } from '../ports/OAuthHttpClient.js'
import { generateId } from '../../domain/shared/EntityId.js'
import { ERROR_NO_ORG, ERROR_NO_CREDENTIALS, ERROR_NO_REFRESH_TOKEN, ERROR_PLUGIN_NOT_FOUND } from '../../defaults.js'
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
    if (!config) throw new Error(ERROR_PLUGIN_NOT_FOUND)

    const orgId = await this.orgRepo.getFirstOrgId()
    if (!orgId) throw new Error(ERROR_NO_ORG)

    const refreshToken = await this.orgRepo.findSetting(orgId, `${pluginId}_refresh_token`)
    if (!refreshToken?.value) throw new Error(ERROR_NO_REFRESH_TOKEN)

    const credentials = await this.credentialPort.resolveCredentials(orgId, pluginId)
    if (!credentials) throw new Error(ERROR_NO_CREDENTIALS)

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
