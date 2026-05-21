/**
 * OAuth2 plugin configuration.
 *
 * This is data, not code. Plugin packages declare their OAuth config
 * in plugin.json. Core reads it at runtime and runs a generic OAuth2
 * flow using the declared URLs and scopes.
 *
 * No provider-specific classes needed. Adding a new OAuth-enabled
 * plugin means shipping a plugin.json with an "oauth" field.
 */

export interface PluginOAuthConfig {
  /** OAuth2 authorize endpoint */
  authorizeUrl: string

  /** OAuth2 token exchange endpoint */
  tokenUrl: string

  /** Endpoint to discover accessible resources (optional) */
  resourcesUrl?: string

  /** Scopes to request */
  scopes: string[]

  /** Extra authorize params (e.g. audience for Atlassian) */
  authorizeParams?: Record<string, string>
}

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
}
