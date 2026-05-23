import { Hono } from 'hono'
import type { AuthEnv } from '../middleware/auth.js'
import {
  type OrgRouteDeps,
  getOrg, updateOrg, getOrgSettings, updateOrgSetting,
  testIntegration, testProvider, listProviderModels,
  listOrgConnections, getConnectionTools, reconnectConnection,
  deleteOrgConnection, listOrgUsers,
} from '../controllers/org.js'

export type { OrgRouteDeps }

export function createOrgRoutes(deps: OrgRouteDeps) {
  const org = new Hono<AuthEnv>()

  org.use('/api/org/*', deps.requireAuth)
  org.use('/api/org', deps.requireAuth)

  org.get('/api/org', getOrg(deps))
  org.put('/api/org', updateOrg(deps))
  org.get('/api/org/settings', getOrgSettings(deps))
  org.put('/api/org/settings/:key', updateOrgSetting(deps))
  org.post('/api/org/integrations/test', testIntegration(deps))
  org.post('/api/org/providers/test', testProvider(deps))
  org.post('/api/org/providers/models', listProviderModels(deps))
  org.get('/api/org/connections', listOrgConnections(deps))
  org.get('/api/org/connections/:id/tools', getConnectionTools(deps))
  org.post('/api/org/connections/:id/reconnect', reconnectConnection(deps))
  org.delete('/api/org/connections/:id', deleteOrgConnection(deps))
  org.get('/api/org/users', listOrgUsers(deps))

  return org
}
