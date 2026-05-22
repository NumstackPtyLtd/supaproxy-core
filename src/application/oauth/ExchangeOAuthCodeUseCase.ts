import type { OrganisationRepository } from '../../domain/organisation/repository.js'
import type { OAuthCredentialPort } from './OAuthCredentialService.js'
import type { OAuthTokens, OAuthResource } from '../ports/OAuthProvider.js'
import { generateId } from '../../domain/shared/EntityId.js'
import { ERROR_NO_ORG, ERROR_NO_CREDENTIALS, ERROR_PLUGIN_NOT_FOUND } from '../../defaults.js'
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
    private readonly dashboardUrl: string,
  ) {}

  async execute(code: string, state: string): Promise<ExchangeResult> {
    const pluginId = state.split(':')[0]
    if (!pluginId) throw new Error(ERROR_PLUGIN_NOT_FOUND)

    const config = await this.credentialPort.resolveOAuthConfig(pluginId)
    if (!config) throw new Error(ERROR_PLUGIN_NOT_FOUND)

    const orgId = await this.orgRepo.getFirstOrgId()
    if (!orgId) throw new Error(ERROR_NO_ORG)

    const credentials = await this.credentialPort.resolveCredentials(orgId, pluginId)
    if (!credentials) throw new Error(ERROR_NO_CREDENTIALS)

    const redirectUri = `${this.dashboardUrl}/oauth/callback`
    const tokenRes = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    })

    if (!tokenRes.ok) {
      const body = await tokenRes.text()
      throw new Error(`Token exchange failed: ${tokenRes.status} ${body}`)
    }

    const tokens = await tokenRes.json() as OAuthTokens
    await this.storeTokens(orgId, pluginId, tokens)
    await this.discoverResources(orgId, pluginId, config.resourcesUrl, tokens.access_token)

    log.info({ pluginId }, 'OAuth connection established')
    return { pluginId, redirectUrl: `${this.dashboardUrl}/settings?oauth=success&plugin=${pluginId}` }
  }

  private async storeTokens(orgId: string, pluginId: string, tokens: OAuthTokens): Promise<void> {
    await this.orgRepo.upsertSetting(generateId(), orgId, `${pluginId}_access_token`, tokens.access_token, true)
    if (tokens.refresh_token) {
      await this.orgRepo.upsertSetting(generateId(), orgId, `${pluginId}_refresh_token`, tokens.refresh_token, true)
    }
  }

  private async discoverResources(orgId: string, pluginId: string, resourcesUrl: string | undefined, accessToken: string): Promise<void> {
    if (!resourcesUrl) return
    try {
      const res = await fetch(resourcesUrl, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      })
      if (!res.ok) return
      const resources = await res.json() as OAuthResource[]
      if (resources.length > 0) {
        await this.orgRepo.upsertSetting(generateId(), orgId, `${pluginId}_resource_id`, resources[0].id, false)
        await this.orgRepo.upsertSetting(generateId(), orgId, `${pluginId}_resource_url`, resources[0].url || resources[0].name, false)
      }
    } catch (err) {
      log.warn({ pluginId, error: (err as Error).message }, 'Failed to discover OAuth resources')
    }
  }
}
