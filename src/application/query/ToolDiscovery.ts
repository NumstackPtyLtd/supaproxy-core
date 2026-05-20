import type { McpClientFactory, McpConnection } from '../ports/McpClient.js'
import type { ToolEntry } from './ToolCallProcessor.js'
import { safeJsonParse } from '../../shared/json.js'
import pino from 'pino'

const log = pino({ name: 'tool-discovery' })

export interface McpServerConfig {
  transport?: string
  url?: string
  headers?: Record<string, string>
  command?: string
  args?: string[]
  env?: Record<string, string>
}

export interface DiscoveredTools {
  tools: ToolEntry[]
  mcpConnections: McpConnection[]
}

export async function discoverTools(
  connections: Array<{ name: string; type: string; config: string }>,
  workspaceId: string,
  mcpFactory: McpClientFactory,
): Promise<DiscoveredTools> {
  const tools: ToolEntry[] = []
  const mcpConnections: McpConnection[] = []

  for (const server of connections.filter(s => s.type === 'mcp')) {
    const cfg: McpServerConfig = typeof server.config === 'string' ? safeJsonParse<McpServerConfig>(server.config, {}) : server.config

    try {
      if (cfg.transport === 'http' && cfg.url) {
        const conn = await mcpFactory.connectHttp(cfg.url, cfg.headers, `supaproxy-${workspaceId}`)
        mcpConnections.push(conn)
        for (const tool of conn.tools) {
          tools.push({
            name: tool.name,
            connection: server.name,
            spec: { name: tool.name, description: tool.description || '', input_schema: tool.inputSchema || { type: 'object', properties: {} } },
            isWrite: (tool as unknown as Record<string, unknown>).is_write === true,
            callFn: (args) => conn.callTool(tool.name, args),
          })
        }
        log.info({ server: server.name, tools: conn.tools.length }, 'MCP connected (HTTP)')
      } else if (cfg.transport === 'stdio' && cfg.command) {
        const conn = await mcpFactory.connectStdio(cfg.command, cfg.args || [], cfg.env, `supaproxy-${workspaceId}`)
        mcpConnections.push(conn)
        for (const tool of conn.tools) {
          tools.push({
            name: tool.name,
            connection: server.name,
            spec: { name: tool.name, description: tool.description || '', input_schema: tool.inputSchema },
            isWrite: (tool as unknown as Record<string, unknown>).is_write === true,
            callFn: (args) => conn.callTool(tool.name, args),
          })
        }
        log.info({ server: server.name, tools: conn.tools.length }, 'MCP connected (STDIO)')
      }
    } catch (err) {
      log.error({ server: server.name, error: (err as Error).message }, 'MCP connection failed')
    }
  }

  return { tools, mcpConnections }
}
