/**
 * Port: OAuth2 provider for third-party service connections.
 *
 * Each provider (Atlassian, Google, GitHub, etc.) implements this interface.
 * The OAuth routes use the provider to generate auth URLs, exchange codes,
 * and refresh tokens. Tokens are stored as org settings.
 */

export interface OAuthTokens {
  access_token: string
  refresh_token?: string
  expires_in?: number
  scope?: string
}

export interface OAuthResource {
  id: string
  name: string
  url: string
  scopes?: string[]
  avatarUrl?: string
}

export interface OAuthProvider {
  /** Provider identifier (e.g. 'atlassian', 'google', 'github') */
  readonly id: string

  /** Human-readable name */
  readonly name: string

  /** Scopes to request */
  readonly scopes: string[]

  /** Build the authorization URL the user gets redirected to */
  getAuthUrl(redirectUri: string, state: string): string

  /** Exchange an authorization code for tokens */
  exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens>

  /** Refresh an expired access token */
  refreshToken(refreshToken: string): Promise<OAuthTokens>

  /** Get accessible resources (e.g. Atlassian cloud sites) */
  getResources(accessToken: string): Promise<OAuthResource[]>

  /** Org setting keys where tokens are stored */
  settingKeys: {
    accessToken: string
    refreshToken: string
    resourceId: string
    resourceUrl: string
  }
}
