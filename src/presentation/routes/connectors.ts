import { Hono } from 'hono'
import { z } from 'zod'
import pino from 'pino'
import type { TestMcpConnectionUseCase } from '../../application/connector/TestMcpConnectionUseCase.js'
import type { SaveMcpConnectionUseCase } from '../../application/connector/SaveMcpConnectionUseCase.js'
import type { BindConsumerChannelUseCase } from '../../application/connector/BindConsumerChannelUseCase.js'
import type { ConnectConsumerUseCase } from '../../application/connector/ConnectConsumerUseCase.js'
import { parseBody } from '../middleware/validate.js'
import { type AuthUser, type AuthEnv } from '../middleware/auth.js'
import type { WorkspaceRepository } from '../../domain/workspace/repository.js'
import type { TenantService } from '../../application/ports/TenantService.js'
import { NotFoundError, ConflictError, ValidationError } from '../../domain/shared/errors.js'
import { MAX_MCP_URL_LENGTH, MAX_MCP_COMMAND_LENGTH, MAX_MCP_ARGS_COUNT, MAX_MCP_HEADER_LENGTH } from '../../defaults.js'

const log = pino({ name: 'routes/connectors' })

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

function handleDomainError(c: import('hono').Context, err: unknown) {
  if (err instanceof NotFoundError) return c.json({ error: err.message }, 404)
  if (err instanceof ConflictError) return c.json({ error: err.message }, 400)
  if (err instanceof ValidationError) return c.json({ error: err.message }, 400)
  throw err
}

export function createConnectorRoutes(deps: ConnectorRouteDeps) {
  async function guardWorkspace(workspaceId: string, userOrgId: string) {
    const ws = await deps.workspaceRepo.findById(workspaceId)
    deps.tenantService.verifyWorkspaceAccess(ws?.org_id ?? null, userOrgId)
  }

  const connectors = new Hono<AuthEnv>()

  connectors.use('/api/connectors/*', deps.requireAuth)

  connectors.post('/api/connectors/consumer/channel', async (c) => {
    const result = await parseBody(c, consumerChannelSchema)
    if (!result.success) return result.response
    const user = c.get('user') as AuthUser
    await guardWorkspace(result.data.workspace_id, user.org_id)
    try {
      const output = await deps.bindConsumerChannelUseCase.execute({
        type: result.data.type,
        workspaceId: result.data.workspace_id,
        channelId: result.data.channel_id,
        channelName: result.data.channel_name,
      })
      return c.json(output)
    } catch (err) { return handleDomainError(c, err) }
  })

  connectors.post('/api/connectors/consumer', async (c) => {
    const result = await parseBody(c, consumerConnectSchema)
    if (!result.success) return result.response
    const user = c.get('user') as AuthUser
    await guardWorkspace(result.data.workspace_id, user.org_id)
    try {
      const output = await deps.connectConsumerUseCase.execute({
        type: result.data.type,
        workspaceId: result.data.workspace_id,
        credentials: result.data.credentials,
        channelId: result.data.channel_id,
      })
      return c.json(output)
    } catch (err) {
      if (err instanceof ValidationError) return c.json({ error: err.message }, 400)
      if (err instanceof NotFoundError) return c.json({ error: err.message }, 404)
      return c.json({ error: (err as Error).message }, 400)
    }
  })

  connectors.post('/api/connectors/mcp/test', async (c) => {
    const result = await parseBody(c, mcpTestSchema)
    if (!result.success) return result.response
    const transport = result.data.transport || (result.data.url ? 'http' : 'stdio')
    const output = await deps.testMcpConnectionUseCase.execute(transport, result.data.url, result.data.command, result.data.headers)
    return c.json(output)
  })

  connectors.post('/api/connectors/mcp', async (c) => {
    const result = await parseBody(c, mcpSaveSchema)
    if (!result.success) return result.response
    const user = c.get('user') as AuthUser
    await guardWorkspace(result.data.workspace_id, user.org_id)
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
  })

  return connectors
}
