import type { OAuthHttpClient, OAuthTokenRequest } from '../../application/ports/OAuthHttpClient.js'
import type { OAuthTokens, OAuthResource } from '../../application/ports/OAuthProvider.js'
import pino from 'pino'

const log = pino({ name: 'oauth-http-client' })

export class FetchOAuthHttpClient implements OAuthHttpClient {
  async exchangeToken(request: OAuthTokenRequest): Promise<OAuthTokens> {
    const body: Record<string, string> = {
      grant_type: request.grantType,
      client_id: request.clientId,
      client_secret: request.clientSecret,
    }
    if (request.code) body.code = request.code
    if (request.refreshToken) body.refresh_token = request.refreshToken
    if (request.redirectUri) body.redirect_uri = request.redirectUri

    const res = await fetch(request.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const text = await res.text()
      log.error({ status: res.status, body: text }, 'Token exchange failed')
      throw new Error(`Token exchange failed: ${res.status}`)
    }

    return await res.json() as OAuthTokens
  }

  async discoverResources(resourcesUrl: string, accessToken: string): Promise<OAuthResource[]> {
    try {
      const res = await fetch(resourcesUrl, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      })
      if (!res.ok) return []
      return await res.json() as OAuthResource[]
    } catch (err) {
      log.warn({ error: (err as Error).message }, 'Failed to discover OAuth resources')
      return []
    }
  }
}
