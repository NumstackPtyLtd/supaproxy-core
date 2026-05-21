import type { OAuthProvider, OAuthTokens, OAuthResource } from '../../application/ports/OAuthProvider.js'

export class AtlassianOAuthProvider implements OAuthProvider {
  readonly id = 'atlassian'
  readonly name = 'Atlassian'
  readonly scopes = [
    'read:confluence-content.all',
    'read:confluence-space.summary',
    'offline_access',
  ]

  readonly settingKeys = {
    accessToken: 'confluence_access_token',
    refreshToken: 'confluence_refresh_token',
    resourceId: 'confluence_cloud_id',
    resourceUrl: 'confluence_site_url',
  }

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {}

  getAuthUrl(redirectUri: string, state: string): string {
    const params = new URLSearchParams({
      audience: 'api.atlassian.com',
      client_id: this.clientId,
      scope: this.scopes.join(' '),
      redirect_uri: redirectUri,
      state,
      response_type: 'code',
      prompt: 'consent',
    })
    return `https://auth.atlassian.com/authorize?${params.toString()}`
  }

  async exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens> {
    const res = await fetch('https://auth.atlassian.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Atlassian token exchange failed: ${res.status} ${body}`)
    }

    return res.json() as Promise<OAuthTokens>
  }

  async refreshToken(refreshToken: string): Promise<OAuthTokens> {
    const res = await fetch('https://auth.atlassian.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Atlassian token refresh failed: ${res.status} ${body}`)
    }

    return res.json() as Promise<OAuthTokens>
  }

  async getResources(accessToken: string): Promise<OAuthResource[]> {
    const res = await fetch('https://api.atlassian.com/oauth/token/accessible-resources', {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    })

    if (!res.ok) {
      throw new Error(`Atlassian resources fetch failed: ${res.status}`)
    }

    const data = await res.json() as Array<{ id: string; name: string; url: string; scopes: string[]; avatarUrl: string }>
    return data.map(r => ({
      id: r.id,
      name: r.name,
      url: r.url,
      scopes: r.scopes,
      avatarUrl: r.avatarUrl,
    }))
  }
}
