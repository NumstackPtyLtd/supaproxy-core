import { httpPlugin, stdioPlugin } from '@supaproxy/connections/plugins'
import type { McpClientFactory, McpConnection, McpToolDefinition, McpToolCallResult } from '../../application/ports/McpClient.js'
import type { McpConnection as PluginConnection } from '@supaproxy/connections'

/**
 * Adapter that delegates to @supaproxy/connections plugins.
 *
 * The server does not implement MCP protocol details. It delegates
 * to the connection plugins which own the transport, protocol version,
 * timeouts, and header handling.
 */
export class McpClientFactoryImpl implements McpClientFactory {

  async connectHttp(url: string, extraHeaders?: Record<string, string>, clientName?: string): Promise<McpConnection> {
    const config: Record<string, string> = {
      url,
      name: clientName || 'supaproxy',
    }
    if (extraHeaders) {
      config.headers = JSON.stringify(extraHeaders)
    }

    const conn = await httpPlugin.connect(config)
    return this.adaptConnection(conn)
  }

  async connectStdio(command: string, args: string[], env?: Record<string, string>, clientName?: string): Promise<McpConnection> {
    const config: Record<string, string> = {
      command,
      args: args.join(' '),
      name: clientName || 'supaproxy',
    }
    if (env) {
      config.env = JSON.stringify(env)
    }

    const conn = await stdioPlugin.connect(config)
    return this.adaptConnection(conn)
  }

  async testHttp(url: string, extraHeaders?: Record<string, string>): Promise<{ ok: boolean; tools: number; server: string; toolNames: string[]; error?: string }> {
    const config: Record<string, string> = { url, name: 'supaproxy-test' }
    if (extraHeaders) {
      config.headers = JSON.stringify(extraHeaders)
    }

    const result = await httpPlugin.test(config)
    return {
      ok: result.ok,
      tools: result.tools || 0,
      server: result.server || '',
      toolNames: result.toolNames || [],
      error: result.error,
    }
  }

  private adaptConnection(conn: PluginConnection): McpConnection {
    const tools: McpToolDefinition[] = conn.tools.map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }))

    return {
      tools,
      async callTool(name: string, args: Record<string, unknown>): Promise<McpToolCallResult> {
        const result = await conn.callTool(name, args)
        return { content: result.content, isError: result.isError }
      },
      async close(): Promise<void> {
        await conn.close()
      },
    }
  }
}
