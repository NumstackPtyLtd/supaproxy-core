import { Hono } from 'hono'
import type { AuthEnv } from '../middleware/auth.js'
import { createGuardWorkspace } from '../helpers/guardWorkspace.js'
import {
  type ConnectorRouteDeps,
  bindConsumerChannel, connectConsumer, testMcpConnection, saveMcpConnection,
} from '../controllers/connectors.js'

export type { ConnectorRouteDeps }

export function createConnectorRoutes(deps: ConnectorRouteDeps) {
  const guardWorkspace = createGuardWorkspace(deps.workspaceRepo, deps.tenantService)

  const connectors = new Hono<AuthEnv>()

  connectors.use('/api/connectors/*', deps.requireAuth)

  connectors.post('/api/connectors/consumer/channel', bindConsumerChannel(deps, guardWorkspace))
  connectors.post('/api/connectors/consumer', connectConsumer(deps, guardWorkspace))
  connectors.post('/api/connectors/mcp/test', testMcpConnection(deps))
  connectors.post('/api/connectors/mcp', saveMcpConnection(deps, guardWorkspace))

  return connectors
}
