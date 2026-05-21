import { Hono } from 'hono'
import { generateId } from '../../domain/shared/EntityId.js'
import type { PluginOAuthConfig, OAuthTokens, OAuthResource } from '../../application/ports/OAuthProvider.js'
import type { OrganisationRepository } from '../../domain/organisation/repository.js'
import pino from 'pino'

const log = pino({ name: 'oauth' })

interface OAuthRouteDeps {
  orgRepo: OrganisationRepository
  requireAuth: (c: unknown, next: () => Promise<void>) => Promise<Response | void>
  dashboardUrl: string
  oauthClientId: string
  oauthClientSecret: string
  /** Resolve a plugin's OAuth config from its ID (reads plugin.json from storage) */
  resolvePluginOAuth: (pluginId: string) => Promise<PluginOAuthConfig | null>
}

export function createOAuthRoutes(deps: OAuthRouteDeps) {
  const oauth = new Hono()

  // GET /api/oauth/:pluginId/authorize — redirect user to provider's auth page
  oauth.get('/api/oauth/:pluginId/authorize', async (c) => {
    const pluginId = c.req.param('pluginId')
    const config = await deps.resolvePluginOAuth(pluginId)
    if (!config) return c.json({ error: 'plugin_not_found_or_no_oauth' }, 404)

    const state = `${pluginId}:${generateId()}`
    const redirectUri = `${deps.dashboardUrl}/oauth/callback`

    const params = new URLSearchParams({
      client_id: deps.oauthClientId,
      scope: config.scopes.join(' '),
      redirect_uri: redirectUri,
      state,
      response_type: 'code',
      prompt: 'consent',
      ...config.authorizeParams,
    })

    return c.redirect(`${config.authorizeUrl}?${params.toString()}`)
  })

  // GET /api/oauth/callback — exchange code for tokens, store as org settings
  oauth.get('/api/oauth/callback', async (c) => {
    const code = c.req.query('code')
    const state = c.req.query('state')
    const error = c.req.query('error')

    if (error) {
      log.warn({ error }, 'OAuth authorization denied')
      return c.redirect(`${deps.dashboardUrl}/settings?oauth=denied`)
    }

    if (!code || !state) {
      return c.redirect(`${deps.dashboardUrl}/settings?oauth=error&reason=missing_params`)
    }

    // State format: pluginId:randomId
    const pluginId = state.split(':')[0]
    const config = await deps.resolvePluginOAuth(pluginId)
    if (!config) {
      return c.redirect(`${deps.dashboardUrl}/settings?oauth=error&reason=unknown_plugin`)
    }

    try {
      const redirectUri = `${deps.dashboardUrl}/oauth/callback`

      // Exchange code for tokens
      const tokenRes = await fetch(config.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          client_id: deps.oauthClientId,
          client_secret: deps.oauthClientSecret,
          code,
          redirect_uri: redirectUri,
        }),
      })

      if (!tokenRes.ok) {
        const body = await tokenRes.text()
        throw new Error(`Token exchange failed: ${tokenRes.status} ${body}`)
      }

      const tokens = await tokenRes.json() as OAuthTokens

      const orgId = await deps.orgRepo.getFirstOrgId()
      if (!orgId) {
        return c.redirect(`${deps.dashboardUrl}/settings?oauth=error&reason=no_org`)
      }

      // Store tokens keyed by plugin ID
      await deps.orgRepo.upsertSetting(generateId(), orgId, `${pluginId}_access_token`, tokens.access_token, true)
      if (tokens.refresh_token) {
        await deps.orgRepo.upsertSetting(generateId(), orgId, `${pluginId}_refresh_token`, tokens.refresh_token, true)
      }

      // Resolve accessible resources if the plugin declares a resources URL
      if (config.resourcesUrl) {
        try {
          const resRes = await fetch(config.resourcesUrl, {
            headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: 'application/json' },
          })
          if (resRes.ok) {
            const resources = await resRes.json() as OAuthResource[]
            if (resources.length > 0) {
              await deps.orgRepo.upsertSetting(generateId(), orgId, `${pluginId}_resource_id`, resources[0].id, false)
              await deps.orgRepo.upsertSetting(generateId(), orgId, `${pluginId}_resource_url`, resources[0].url || resources[0].name, false)
            }
          }
        } catch (err) {
          log.warn({ pluginId, error: (err as Error).message }, 'Failed to resolve OAuth resources')
        }
      }

      log.info({ pluginId }, 'OAuth connection established')
      return c.redirect(`${deps.dashboardUrl}/settings?oauth=success&plugin=${pluginId}`)
    } catch (err) {
      log.error({ pluginId, error: (err as Error).message }, 'OAuth token exchange failed')
      return c.redirect(`${deps.dashboardUrl}/settings?oauth=error&reason=token_exchange`)
    }
  })

  // GET /api/oauth/:pluginId/status — check if connected
  oauth.get('/api/oauth/:pluginId/status', async (c) => {
    const pluginId = c.req.param('pluginId')
    const orgId = await deps.orgRepo.getFirstOrgId()
    if (!orgId) return c.json({ connected: false })

    const token = await deps.orgRepo.findSetting(orgId, `${pluginId}_access_token`)
    const resourceUrl = await deps.orgRepo.findSetting(orgId, `${pluginId}_resource_url`)

    return c.json({
      connected: !!token?.value,
      site: resourceUrl?.value || null,
    })
  })

  // DELETE /api/oauth/:pluginId — disconnect
  oauth.delete('/api/oauth/:pluginId', async (c) => {
    const pluginId = c.req.param('pluginId')
    const orgId = await deps.orgRepo.getFirstOrgId()
    if (!orgId) return c.json({ error: 'no_org' }, 400)

    for (const suffix of ['access_token', 'refresh_token', 'resource_id', 'resource_url']) {
      const key = `${pluginId}_${suffix}`
      const setting = await deps.orgRepo.findSetting(orgId, key)
      if (setting) {
        await deps.orgRepo.upsertSetting(setting.id, orgId, key, '', false)
      }
    }

    log.info({ pluginId }, 'OAuth connection removed')
    return c.json({ disconnected: true })
  })

  return oauth
}
