import type { OAuthTokens, OAuthResource } from './OAuthProvider.js'

export interface OAuthTokenRequest {
  tokenUrl: string
  clientId: string
  clientSecret: string
  grantType: 'authorization_code' | 'refresh_token'
  code?: string
  refreshToken?: string
  redirectUri?: string
}

export interface OAuthHttpClient {
  exchangeToken(request: OAuthTokenRequest): Promise<OAuthTokens>
  discoverResources(resourcesUrl: string, accessToken: string): Promise<OAuthResource[]>
}
