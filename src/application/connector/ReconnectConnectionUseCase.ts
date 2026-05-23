import type { WorkspaceRepository } from '../../domain/workspace/repository.js'
import type { McpClientFactory } from '../ports/McpClient.js'
import { NotFoundError } from '../../domain/shared/errors.js'
import { generateId } from '../../domain/shared/EntityId.js'
import { STATUS_CONNECTED, STATUS_DISCONNECTED } from '../../defaults.js'

interface ReconnectResult {
  status: string
  tools: number
  message: string
}

export class ReconnectConnectionUseCase {
  constructor(
    private readonly workspaceRepo: WorkspaceRepository,
    private readonly mcpFactory: McpClientFactory,
  ) {}

  async execute(connectionId: string): Promise<ReconnectResult> {
    const connections = await this.workspaceRepo.findConnectionById(connectionId)
    if (!connections) throw new NotFoundError('Connection', connectionId)

    const config = (typeof connections.config === 'string' ? JSON.parse(connections.config) : connections.config) as Record<string, unknown>
    const transport = (config.transport as string) || 'http'

    if (transport !== 'http') {
      return { status: 'skipped', tools: 0, message: 'STDIO connections are tested on first query.' }
    }

    const url = config.url as string
    if (!url) {
      return { status: 'error', tools: 0, message: 'No URL configured.' }
    }

    try {
      await this.workspaceRepo.deleteToolsByConnection(connectionId)
      const headers = config.headers as Record<string, string> | undefined
      const connection = await this.mcpFactory.connectHttp(url, headers, 'supaproxy')
      try {
        if (connection.tools.length > 0) {
          await this.workspaceRepo.createTools(
            connection.tools.map(t => ({
              id: generateId(),
              connectionId,
              name: t.name,
              description: t.description || '',
              inputSchema: JSON.stringify(t.inputSchema || {}),
              isWrite: false,
            }))
          )
        }
        await this.workspaceRepo.updateConnectionStatus(connectionId, STATUS_CONNECTED)
        return { status: STATUS_CONNECTED, tools: connection.tools.length, message: `Connected, ${connection.tools.length} tools discovered.` }
      } finally {
        await connection.close()
      }
    } catch (err) {
      await this.workspaceRepo.updateConnectionStatus(connectionId, STATUS_DISCONNECTED)
      const raw = (err as Error).message
      const message = raw === 'fetch failed' ? 'Could not reach the server. Check that the URL is correct and the service is running.' : raw
      return { status: STATUS_DISCONNECTED, tools: 0, message }
    }
  }
}
