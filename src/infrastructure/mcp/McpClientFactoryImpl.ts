import { httpPlugin, ssePlugin, stdioPlugin } from '@supaproxy/connections/plugins'
import type { McpClientFactory, McpConnection, McpToolDefinition, McpToolCallResult } from '../../application/ports/McpClient.js'
import type { McpConnection as PluginConnection } from '@supaproxy/connections'
import pino from 'pino'

const log = pino({ name: 'mcp-factory' })

/**
 * Adapter that delegates to @supaproxy/connections plugins.
 *
 * For HTTP connections, tries Streamable HTTP first and falls back
 * to SSE transport automatically.
 */
export class McpClientFactoryImpl implements McpClientFactory {

  async connectHttp(url: string, extraHeaders?: Record<string, string>, clientName?: string): Promise<McpConnection> {
    const config = this.buildHttpConfig(url, clientName, extraHeaders)

    try {
      const conn = await httpPlugin.connect(config)
      return this.adaptConnection(conn)
    } catch (httpErr) {
      log.info({ url, error: (httpErr as Error).message }, 'Streamable HTTP failed, trying SSE')
      const conn = await ssePlugin.connect(config)
      return this.adaptConnection(conn)
    }
  }

  async connectSse(url: string, extraHeaders?: Record<string, string>, clientName?: string): Promise<McpConnection> {
    const config = this.buildHttpConfig(url, clientName, extraHeaders)
    const conn = await ssePlugin.connect(config)
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

    const httpResult = await httpPlugin.test(config)
    if (httpResult.ok) return this.formatTestResult(httpResult)

    log.info({ url, error: httpResult.error }, 'Streamable HTTP test failed, trying SSE')
    const sseResult = await ssePlugin.test(config)
    return this.formatTestResult(sseResult)
  }

  private buildHttpConfig(url: string, clientName?: string, extraHeaders?: Record<string, string>): Record<string, string> {
    const config: Record<string, string> = { url, name: clientName || 'supaproxy' }
    if (extraHeaders) {
      config.headers = JSON.stringify(extraHeaders)
    }
    return config
  }

  private formatTestResult(result: { ok: boolean; tools?: number; server?: string; toolNames?: string[]; error?: string }) {
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
