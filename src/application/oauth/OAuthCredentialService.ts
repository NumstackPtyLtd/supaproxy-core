import type { PluginOAuthConfig } from '../ports/OAuthProvider.js'

export interface OAuthCredentials {
  clientId: string
  clientSecret: string
}

/**
 * Port for resolving OAuth credentials and plugin configuration.
 * Implementation lives in the route factory dependencies.
 */
export interface OAuthCredentialPort {
  resolveCredentials(orgId: string, pluginId: string): Promise<OAuthCredentials | null>
  resolveOAuthConfig(pluginId: string): Promise<PluginOAuthConfig | null>
}
