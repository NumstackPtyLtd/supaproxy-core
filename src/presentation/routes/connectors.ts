import { Hono } from 'hono'
import { z } from 'zod'
import type { TestMcpConnectionUseCase } from '../../application/connector/TestMcpConnectionUseCase.js'
import type { SaveMcpConnectionUseCase } from '../../application/connector/SaveMcpConnectionUseCase.js'
import type { BindConsumerChannelUseCase } from '../../application/connector/BindConsumerChannelUseCase.js'
import type { ConnectConsumerUseCase } from '../../application/connector/ConnectConsumerUseCase.js'
import { parseBody } from '../middleware/validate.js'
import { type AuthUser, type AuthEnv } from '../middleware/auth.js'
import type { WorkspaceRepository } from '../../domain/workspace/repository.js'
import type { TenantService } from '../../application/ports/TenantService.js'
import { handleDomainError } from '../helpers/handleDomainError.js'
import { createGuardWorkspace, type GuardFn } from '../helpers/guardWorkspace.js'
import { ValidationError, NotFoundError } from '../../domain/shared/errors.js'
import { MAX_MCP_URL_LENGTH, MAX_MCP_COMMAND_LENGTH, MAX_MCP_ARGS_COUNT, MAX_MCP_HEADER_LENGTH } from '../../defaults.js'

const mcpTestSchema = z.object({ transport: z.enum(['http', 'stdio']).optional(), url: z.string().url().max(MAX_MCP_URL_LENGTH).optional(), command: z.string().max(MAX_MCP_COMMAND_LENGTH).optional(), headers: z.record(z.string().max(MAX_MCP_HEADER_LENGTH)).optional() })
const mcpSaveSchema = z.object({ workspace_id: z.string().min(1).max(255), name: z.string().min(1).max(255), transport: z.enum(['http', 'stdio']).optional(), url: z.string().url().max(MAX_MCP_URL_LENGTH).optional(), command: z.string().max(MAX_MCP_COMMAND_LENGTH).optional(), args: z.array(z.string().max(MAX_MCP_COMMAND_LENGTH)).max(MAX_MCP_ARGS_COUNT).optional(), headers: z.record(z.string().max(MAX_MCP_HEADER_LENGTH)).optional(), env: z.record(z.string().max(MAX_MCP_HEADER_LENGTH)).optional() })
const consumerChannelSchema = z.object({ type: z.string().min(1), workspace_id: z.string().min(1).max(255), channel_id: z.string().min(1).max(100), channel_name: z.string().max(255).optional() })
const consumerConnectSchema = z.object({ type: z.string().min(1), workspace_id: z.string().min(1).max(255), credentials: z.record(z.string().max(500)), channel_id: z.string().max(100).optional() })

interface ConnectorRouteDeps {
  testMcpConnectionUseCase: TestMcpConnectionUseCase
  saveMcpConnectionUseCase: SaveMcpConnectionUseCase
  bindConsumerChannelUseCase: BindConsumerChannelUseCase
  connectConsumerUseCase: ConnectConsumerUseCase
  workspaceRepo: WorkspaceRepository
  tenantService: TenantService
  requireAuth: (c: import('hono').Context, next: import('hono').Next) => Promise<Response | void>
}

function bindConsumerChannel(deps: ConnectorRouteDeps, guard: GuardFn) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const result = await parseBody(c, consumerChannelSchema)
    if (!result.success) return result.response
    const user = c.get('user') as AuthUser
    await guard(result.data.workspace_id, user.org_id)
    try {
      const output = await deps.bindConsumerChannelUseCase.execute({
        type: result.data.type,
        workspaceId: result.data.workspace_id,
        channelId: result.data.channel_id,
        channelName: result.data.channel_name,
      })
      return c.json(output)
    } catch (err) { return handleDomainError(c, err) }
  }
}

function connectConsumer(deps: ConnectorRouteDeps, guard: GuardFn) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const result = await parseBody(c, consumerConnectSchema)
    if (!result.success) return result.response
    const user = c.get('user') as AuthUser
    await guard(result.data.workspace_id, user.org_id)
    try {
      const output = await deps.connectConsumerUseCase.execute({
        type: result.data.type,
        workspaceId: result.data.workspace_id,
        credentials: result.data.credentials,
        channelId: result.data.channel_id,
      })
      return c.json(output)
    } catch (err) {
      if (err instanceof ValidationError) return c.json({ error: 'validation_failed' }, 400)
      if (err instanceof NotFoundError) return c.json({ error: 'not_found' }, 404)
      return c.json({ error: 'consumer_connect_failed' }, 400)
    }
  }
}

function testMcpConnection(deps: ConnectorRouteDeps) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const result = await parseBody(c, mcpTestSchema)
    if (!result.success) return result.response
    const transport = result.data.transport || (result.data.url ? 'http' : 'stdio')
    const output = await deps.testMcpConnectionUseCase.execute(transport, result.data.url, result.data.command, result.data.headers)
    return c.json(output)
  }
}

function saveMcpConnection(deps: ConnectorRouteDeps, guard: GuardFn) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const result = await parseBody(c, mcpSaveSchema)
    if (!result.success) return result.response
    const user = c.get('user') as AuthUser
    await guard(result.data.workspace_id, user.org_id)
    try {
      const output = await deps.saveMcpConnectionUseCase.execute({
        workspaceId: result.data.workspace_id,
        name: result.data.name,
        transport: result.data.transport,
        url: result.data.url,
        command: result.data.command,
        args: result.data.args,
        headers: result.data.headers,
        env: result.data.env,
      })
      return c.json(output)
    } catch (err) { return handleDomainError(c, err) }
  }
}

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
