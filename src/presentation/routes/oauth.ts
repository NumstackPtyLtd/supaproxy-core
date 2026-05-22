import { Hono } from 'hono'
import { generateId } from '../../domain/shared/EntityId.js'
import type { OrganisationRepository } from '../../domain/organisation/repository.js'
import type { OAuthCredentialPort } from '../../application/oauth/OAuthCredentialService.js'
import { ExchangeOAuthCodeUseCase } from '../../application/oauth/ExchangeOAuthCodeUseCase.js'
import { RefreshOAuthTokenUseCase } from '../../application/oauth/RefreshOAuthTokenUseCase.js'
import { DisconnectOAuthUseCase } from '../../application/oauth/DisconnectOAuthUseCase.js'
import { FetchOAuthHttpClient } from '../../infrastructure/oauth/FetchOAuthHttpClient.js'
import { OAUTH_RESPONSE_TYPE, OAUTH_PROMPT, ERROR_PLUGIN_NOT_FOUND, ERROR_NO_ORG, ERROR_NO_CREDENTIALS } from '../../defaults.js'
import pino from 'pino'

const log = pino({ name: 'oauth' })

interface OAuthRouteDeps {
  orgRepo: OrganisationRepository
  requireAuth: (c: unknown, next: () => Promise<void>) => Promise<Response | void>
  dashboardUrl: string
  credentialPort: OAuthCredentialPort
}

export function createOAuthRoutes(deps: OAuthRouteDeps) {
  const oauth = new Hono()
  const { orgRepo, credentialPort, dashboardUrl } = deps
  const oauthHttp = new FetchOAuthHttpClient()
  const exchangeUseCase = new ExchangeOAuthCodeUseCase(orgRepo, credentialPort, oauthHttp, dashboardUrl)
  const refreshUseCase = new RefreshOAuthTokenUseCase(orgRepo, credentialPort, oauthHttp)
  const disconnectUseCase = new DisconnectOAuthUseCase(orgRepo)

  oauth.get('/api/oauth/:pluginId/authorize', async (c) => {
    const pluginId = c.req.param('pluginId')
    const config = await credentialPort.resolveOAuthConfig(pluginId)
    if (!config) return c.json({ error: ERROR_PLUGIN_NOT_FOUND }, 404)

    const orgId = await orgRepo.getFirstOrgId()
    if (!orgId) return c.json({ error: ERROR_NO_ORG }, 400)

    const credentials = await credentialPort.resolveCredentials(orgId, pluginId)
    if (!credentials) return c.json({ error: ERROR_NO_CREDENTIALS }, 400)

    const state = `${pluginId}:${generateId()}`
    const params = new URLSearchParams({
      client_id: credentials.clientId,
      scope: config.scopes.join(' '),
      redirect_uri: `${dashboardUrl}/oauth/callback`,
      state,
      response_type: OAUTH_RESPONSE_TYPE,
      prompt: OAUTH_PROMPT,
      ...config.authorizeParams,
    })

    return c.redirect(`${config.authorizeUrl}?${params.toString()}`)
  })

  oauth.get('/api/oauth/callback', async (c) => {
    const code = c.req.query('code')
    const state = c.req.query('state')
    const error = c.req.query('error')

    if (error) {
      log.warn({ error }, 'OAuth authorisation denied')
      return c.redirect(`${dashboardUrl}/settings?oauth=denied`)
    }
    if (!code || !state) {
      return c.redirect(`${dashboardUrl}/settings?oauth=error&reason=missing_params`)
    }

    try {
      const result = await exchangeUseCase.execute(code, state)
      return c.redirect(result.redirectUrl)
    } catch (err) {
      const pluginId = state.split(':')[0]
      log.error({ pluginId, error: (err as Error).message }, 'OAuth token exchange failed')
      return c.redirect(`${dashboardUrl}/settings?oauth=error&reason=token_exchange`)
    }
  })

  oauth.get('/api/oauth/:pluginId/status', async (c) => {
    const pluginId = c.req.param('pluginId')
    const orgId = await orgRepo.getFirstOrgId()
    if (!orgId) return c.json({ connected: false })

    const token = await orgRepo.findSetting(orgId, `${pluginId}_access_token`)
    const resourceUrl = await orgRepo.findSetting(orgId, `${pluginId}_resource_url`)
    return c.json({ connected: !!token?.value, site: resourceUrl?.value || null })
  })

  oauth.post('/api/oauth/:pluginId/refresh', async (c) => {
    try {
      const result = await refreshUseCase.execute(c.req.param('pluginId'))
      return c.json(result)
    } catch (err) {
      log.error({ error: (err as Error).message }, 'Token refresh error')
      return c.json({ error: (err as Error).message }, 502)
    }
  })

  oauth.delete('/api/oauth/:pluginId', async (c) => {
    try {
      const result = await disconnectUseCase.execute(c.req.param('pluginId'))
      return c.json(result)
    } catch (err) {
      log.error({ error: (err as Error).message }, 'OAuth disconnect error')
      return c.json({ error: (err as Error).message }, 400)
    }
  })

  return oauth
}
