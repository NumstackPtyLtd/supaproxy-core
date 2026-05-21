import { Hono } from 'hono'
import { generateId } from '../../domain/shared/EntityId.js'
import type { OAuthProvider } from '../../application/ports/OAuthProvider.js'
import type { OrganisationRepository } from '../../domain/organisation/repository.js'
import pino from 'pino'

const log = pino({ name: 'oauth' })

interface OAuthRouteDeps {
  providers: Map<string, OAuthProvider>
  orgRepo: OrganisationRepository
  requireAuth: (c: unknown, next: () => Promise<void>) => Promise<Response | void>
  dashboardUrl: string
}

export function createOAuthRoutes(deps: OAuthRouteDeps) {
  const oauth = new Hono()

  // GET /api/oauth/:provider/authorize — redirect user to provider's auth page
  oauth.get('/api/oauth/:provider/authorize', async (c) => {
    const providerId = c.req.param('provider')
    const provider = deps.providers.get(providerId)
    if (!provider) return c.json({ error: 'unknown_provider' }, 404)

    const state = generateId()
    const redirectUri = `${deps.dashboardUrl}/oauth/${providerId}/callback`
    const authUrl = provider.getAuthUrl(redirectUri, state)

    return c.redirect(authUrl)
  })

  // GET /api/oauth/:provider/callback — exchange code for tokens, store in org settings
  oauth.get('/api/oauth/:provider/callback', async (c) => {
    const providerId = c.req.param('provider')
    const provider = deps.providers.get(providerId)
    if (!provider) return c.json({ error: 'unknown_provider' }, 404)

    const code = c.req.query('code')
    const error = c.req.query('error')

    if (error) {
      log.warn({ provider: providerId, error }, 'OAuth authorization denied')
      return c.redirect(`${deps.dashboardUrl}/settings?oauth=denied`)
    }

    if (!code) {
      return c.redirect(`${deps.dashboardUrl}/settings?oauth=error&reason=no_code`)
    }

    try {
      const redirectUri = `${deps.dashboardUrl}/oauth/${providerId}/callback`
      const tokens = await provider.exchangeCode(code, redirectUri)

      // Get the org to store settings
      const orgId = await deps.orgRepo.getFirstOrgId()
      if (!orgId) {
        return c.redirect(`${deps.dashboardUrl}/settings?oauth=error&reason=no_org`)
      }

      // Store access token
      await deps.orgRepo.upsertSetting(generateId(), orgId, provider.settingKeys.accessToken, tokens.access_token, true)

      // Store refresh token if provided
      if (tokens.refresh_token) {
        await deps.orgRepo.upsertSetting(generateId(), orgId, provider.settingKeys.refreshToken, tokens.refresh_token, true)
      }

      // Resolve and store the cloud resource (e.g. Atlassian site)
      const resources = await provider.getResources(tokens.access_token)
      if (resources.length > 0) {
        await deps.orgRepo.upsertSetting(generateId(), orgId, provider.settingKeys.resourceId, resources[0].id, false)
        await deps.orgRepo.upsertSetting(generateId(), orgId, provider.settingKeys.resourceUrl, resources[0].url, false)
      }

      log.info({ provider: providerId, resourceCount: resources.length }, 'OAuth connection established')
      return c.redirect(`${deps.dashboardUrl}/settings?oauth=success&provider=${providerId}`)
    } catch (err) {
      log.error({ provider: providerId, error: (err as Error).message }, 'OAuth token exchange failed')
      return c.redirect(`${deps.dashboardUrl}/settings?oauth=error&reason=token_exchange`)
    }
  })

  // GET /api/oauth/:provider/status — check if connected
  oauth.get('/api/oauth/:provider/status', async (c) => {
    const providerId = c.req.param('provider')
    const provider = deps.providers.get(providerId)
    if (!provider) return c.json({ error: 'unknown_provider' }, 404)

    const orgId = await deps.orgRepo.getFirstOrgId()
    if (!orgId) return c.json({ connected: false })

    const token = await deps.orgRepo.findSetting(orgId, provider.settingKeys.accessToken)
    const resourceUrl = await deps.orgRepo.findSetting(orgId, provider.settingKeys.resourceUrl)

    return c.json({
      connected: !!token,
      site: resourceUrl?.value || null,
      provider: provider.name,
    })
  })

  // DELETE /api/oauth/:provider — disconnect
  oauth.delete('/api/oauth/:provider', async (c) => {
    const providerId = c.req.param('provider')
    const provider = deps.providers.get(providerId)
    if (!provider) return c.json({ error: 'unknown_provider' }, 404)

    const orgId = await deps.orgRepo.getFirstOrgId()
    if (!orgId) return c.json({ error: 'no_org' }, 400)

    // Clear all stored tokens
    for (const key of Object.values(provider.settingKeys)) {
      const setting = await deps.orgRepo.findSetting(orgId, key)
      if (setting) {
        await deps.orgRepo.upsertSetting(setting.id, orgId, key, '', false)
      }
    }

    log.info({ provider: providerId }, 'OAuth connection removed')
    return c.json({ disconnected: true })
  })

  return oauth
}
