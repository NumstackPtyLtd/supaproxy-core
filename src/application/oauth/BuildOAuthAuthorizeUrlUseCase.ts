import type { OrganisationRepository } from '../../domain/organisation/repository.js'
import type { OAuthCredentialPort } from './OAuthCredentialService.js'
import { generateId } from '../../domain/shared/EntityId.js'
import { NotFoundError, ConfigurationError } from '../../domain/shared/errors.js'
import { OAUTH_RESPONSE_TYPE, OAUTH_PROMPT } from '../../defaults.js'

export class BuildOAuthAuthorizeUrlUseCase {
  constructor(
    private readonly orgRepo: OrganisationRepository,
    private readonly credentialPort: OAuthCredentialPort,
  ) {}

  async execute(pluginId: string, redirectUri: string): Promise<string> {
    const config = await this.credentialPort.resolveOAuthConfig(pluginId)
    if (!config) throw new NotFoundError('OAuthConfig', pluginId)

    const orgId = await this.orgRepo.getFirstOrgId()
    if (!orgId) throw new ConfigurationError('No organisation configured')

    const credentials = await this.credentialPort.resolveCredentials(orgId, pluginId)
    if (!credentials) throw new ConfigurationError('OAuth credentials not configured')

    const state = `${pluginId}:${generateId()}`
    const params = new URLSearchParams({
      client_id: credentials.clientId,
      scope: config.scopes.join(' '),
      redirect_uri: redirectUri,
      state,
      response_type: OAUTH_RESPONSE_TYPE,
      prompt: OAUTH_PROMPT,
      ...config.authorizeParams,
    })

    return `${config.authorizeUrl}?${params.toString()}`
  }
}
