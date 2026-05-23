import { Hono } from 'hono'
import type { AuthEnv } from '../middleware/auth.js'
import { type RouteRouteDeps, routeMessage } from '../controllers/route.js'

export type { RouteRouteDeps }

export function createRouteRoutes(deps: RouteRouteDeps) {
  const route = new Hono<AuthEnv>()

  route.use('/api/route', deps.requireAuth)
  route.post('/api/route', routeMessage(deps))

  return route
}
