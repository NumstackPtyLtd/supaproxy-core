import { Hono } from 'hono'
import {
  type OAuthRouteDeps,
  authorize, callback, getStatus, refreshToken, disconnect,
} from '../controllers/oauth.js'

export type { OAuthRouteDeps }

export function createOAuthRoutes(deps: OAuthRouteDeps) {
  const oauth = new Hono()

  oauth.get('/api/oauth/:pluginId/authorize', authorize(deps))
  oauth.get('/api/oauth/callback', callback(deps))
  oauth.get('/api/oauth/:pluginId/status', getStatus(deps))
  oauth.post('/api/oauth/:pluginId/refresh', refreshToken(deps))
  oauth.delete('/api/oauth/:pluginId', disconnect(deps))

  return oauth
}
