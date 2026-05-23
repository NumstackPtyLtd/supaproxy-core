import type { TestMcpConnectionUseCase } from '../../application/connector/TestMcpConnectionUseCase.js'
import type { SaveMcpConnectionUseCase } from '../../application/connector/SaveMcpConnectionUseCase.js'
import type { BindConsumerChannelUseCase } from '../../application/connector/BindConsumerChannelUseCase.js'
import type { ConnectConsumerUseCase } from '../../application/connector/ConnectConsumerUseCase.js'
import { parseBody } from '../middleware/validate.js'
import { type AuthUser, type AuthEnv } from '../middleware/auth.js'
import type { WorkspaceRepository } from '../../domain/workspace/repository.js'
import type { TenantService } from '../../application/ports/TenantService.js'
import { handleDomainError } from '../helpers/handleDomainError.js'
import type { GuardFn } from '../helpers/guardWorkspace.js'
import { ValidationError, NotFoundError } from '../../domain/shared/errors.js'
import { mcpTestSchema, mcpSaveSchema, consumerChannelSchema, consumerConnectSchema } from '../validators/connectors.js'

export interface ConnectorRouteDeps {
  testMcpConnectionUseCase: TestMcpConnectionUseCase
  saveMcpConnectionUseCase: SaveMcpConnectionUseCase
  bindConsumerChannelUseCase: BindConsumerChannelUseCase
  connectConsumerUseCase: ConnectConsumerUseCase
  workspaceRepo: WorkspaceRepository
  tenantService: TenantService
  requireAuth: (c: import('hono').Context, next: import('hono').Next) => Promise<Response | void>
}

export function bindConsumerChannel(deps: ConnectorRouteDeps, guard: GuardFn) {
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

export function connectConsumer(deps: ConnectorRouteDeps, guard: GuardFn) {
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

export function testMcpConnection(deps: ConnectorRouteDeps) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const result = await parseBody(c, mcpTestSchema)
    if (!result.success) return result.response
    const transport = result.data.transport || (result.data.url ? 'http' : 'stdio')
    const output = await deps.testMcpConnectionUseCase.execute(transport, result.data.url, result.data.command, result.data.headers)
    return c.json(output)
  }
}

export function saveMcpConnection(deps: ConnectorRouteDeps, guard: GuardFn) {
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
