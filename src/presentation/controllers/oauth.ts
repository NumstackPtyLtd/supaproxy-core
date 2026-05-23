import type { BuildOAuthAuthorizeUrlUseCase } from '../../application/oauth/BuildOAuthAuthorizeUrlUseCase.js'
import type { ExchangeOAuthCodeUseCase } from '../../application/oauth/ExchangeOAuthCodeUseCase.js'
import type { RefreshOAuthTokenUseCase } from '../../application/oauth/RefreshOAuthTokenUseCase.js'
import type { DisconnectOAuthUseCase } from '../../application/oauth/DisconnectOAuthUseCase.js'
import type { GetOAuthStatusUseCase } from '../../application/oauth/GetOAuthStatusUseCase.js'
import { NotFoundError, ConfigurationError } from '../../domain/shared/errors.js'
import pino from 'pino'

const log = pino({ name: 'oauth' })

export interface OAuthRouteDeps {
  buildOAuthAuthorizeUrlUseCase: BuildOAuthAuthorizeUrlUseCase
  exchangeOAuthCodeUseCase: ExchangeOAuthCodeUseCase
  refreshOAuthTokenUseCase: RefreshOAuthTokenUseCase
  disconnectOAuthUseCase: DisconnectOAuthUseCase
  getOAuthStatusUseCase: GetOAuthStatusUseCase
  dashboardUrl: string
  requireAuth: (c: unknown, next: () => Promise<void>) => Promise<Response | void>
}

export function authorize(deps: OAuthRouteDeps) {
  return async (c: import('hono').Context) => {
    try {
      const url = await deps.buildOAuthAuthorizeUrlUseCase.execute(c.req.param('pluginId')!)
      return c.redirect(url)
    } catch (err) {
      if (err instanceof NotFoundError) return c.json({ error: 'plugin_not_found' }, 404)
      if (err instanceof ConfigurationError) return c.json({ error: (err as Error).message }, 400)
      throw err
    }
  }
}

export function callback(deps: OAuthRouteDeps) {
  return async (c: import('hono').Context) => {
    const code = c.req.query('code')
    const state = c.req.query('state')
    const error = c.req.query('error')

    if (error) {
      log.warn({ error }, 'OAuth authorisation denied')
      return c.redirect(`${deps.dashboardUrl}/settings?oauth=denied`)
    }
    if (!code || !state) {
      return c.redirect(`${deps.dashboardUrl}/settings?oauth=error&reason=missing_params`)
    }

    try {
      const result = await deps.exchangeOAuthCodeUseCase.execute(code, state)
      return c.redirect(result.redirectUrl)
    } catch (err) {
      const pluginId = state.split(':')[0]
      log.error({ pluginId, error: (err as Error).message }, 'OAuth token exchange failed')
      return c.redirect(`${deps.dashboardUrl}/settings?oauth=error&reason=token_exchange`)
    }
  }
}

export function getStatus(deps: OAuthRouteDeps) {
  return async (c: import('hono').Context) => {
    const result = await deps.getOAuthStatusUseCase.execute(c.req.param('pluginId')!)
    return c.json(result)
  }
}

export function refreshToken(deps: OAuthRouteDeps) {
  return async (c: import('hono').Context) => {
    try {
      const result = await deps.refreshOAuthTokenUseCase.execute(c.req.param('pluginId')!)
      return c.json(result)
    } catch (err) {
      log.error({ error: (err as Error).message }, 'Token refresh error')
      return c.json({ error: (err as Error).message }, 502)
    }
  }
}

export function disconnect(deps: OAuthRouteDeps) {
  return async (c: import('hono').Context) => {
    try {
      const result = await deps.disconnectOAuthUseCase.execute(c.req.param('pluginId')!)
      return c.json(result)
    } catch (err) {
      log.error({ error: (err as Error).message }, 'OAuth disconnect error')
      return c.json({ error: (err as Error).message }, 400)
    }
  }
}
