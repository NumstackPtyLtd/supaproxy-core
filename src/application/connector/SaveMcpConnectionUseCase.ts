import type { WorkspaceRepository } from '../../domain/workspace/repository.js'
import type { McpClientFactory } from '../ports/McpClient.js'
import { generateId } from '../../domain/shared/EntityId.js'
import { NotFoundError, ValidationError } from '../../domain/shared/errors.js'
import { STATUS_CONNECTED, STATUS_SAVED } from '../../defaults.js'

interface SaveMcpInput {
  workspaceId: string
  name: string
  transport?: string
  url?: string
  command?: string
  args?: string[]
  headers?: Record<string, string>
  env?: Record<string, string>
}

interface SaveMcpOutput {
  status: string
  message: string
  tools?: number
}

export class SaveMcpConnectionUseCase {
  constructor(
    private readonly workspaceRepo: WorkspaceRepository,
    private readonly mcpFactory: McpClientFactory,
  ) {}

  async execute(input: SaveMcpInput): Promise<SaveMcpOutput> {
    const resolvedTransport = input.transport || (input.url ? 'http' : 'stdio')

    if (resolvedTransport === 'http' && !input.url) {
      throw new ValidationError('Server URL is required for HTTP transport')
    }
    if (resolvedTransport === 'stdio' && !input.command) {
      throw new ValidationError('Command is required for STDIO transport')
    }

    const exists = await this.workspaceRepo.existsById(input.workspaceId)
    if (!exists) throw new NotFoundError('Workspace', input.workspaceId)

    const config = resolvedTransport === 'http'
      ? JSON.stringify({ transport: 'http', url: input.url, ...(input.headers && Object.keys(input.headers).length > 0 ? { headers: input.headers } : {}) })
      : JSON.stringify({ transport: 'stdio', command: input.command, args: input.args || [], ...(input.env && Object.keys(input.env).length > 0 ? { env: input.env } : {}) })

    const existing = await this.workspaceRepo.findConnectionByName(input.workspaceId, input.name)

    let connId: string
    if (existing) {
      connId = existing.id
      await this.workspaceRepo.updateConnectionConfig(connId, config)
      await this.workspaceRepo.deleteToolsByConnection(connId)
    } else {
      connId = generateId()
      await this.workspaceRepo.createConnection(connId, input.workspaceId, input.name, 'mcp', config)
    }

    if (resolvedTransport === 'http' && input.url) {
      return this.discoverAndSaveTools(connId, input.url, input.headers)
    }

    return { status: STATUS_SAVED, message: 'Connection saved. Tools will be discovered on the first query.' }
  }

  private async discoverAndSaveTools(connId: string, url: string, headers?: Record<string, string>): Promise<SaveMcpOutput> {
    try {
      const connection = await this.mcpFactory.connectHttp(url, headers, 'supaproxy')
      try {
        if (connection.tools.length > 0) {
          await this.workspaceRepo.createTools(
            connection.tools.map(t => ({
              id: generateId(),
              connectionId: connId,
              name: t.name,
              description: t.description || '',
              inputSchema: JSON.stringify(t.inputSchema || {}),
              isWrite: false,
            }))
          )
        }
        await this.workspaceRepo.updateConnectionStatus(connId, STATUS_CONNECTED)
        return { status: STATUS_SAVED, message: `Connected, ${connection.tools.length} tools discovered.`, tools: connection.tools.length }
      } finally {
        await connection.close()
      }
    } catch (err) {
      return { status: STATUS_SAVED, message: `Saved but could not discover tools: ${(err as Error).message}`, tools: 0 }
    }
  }
}
