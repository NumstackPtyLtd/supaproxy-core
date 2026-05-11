import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import type { McpClientFactory, McpConnection, McpToolDefinition, McpToolCallResult } from '../../application/ports/McpClient.js'
import pino from 'pino'

const log = pino({ name: 'mcp-client' })

interface JsonRpcResponse {
  jsonrpc: string
  id: number
  result?: Record<string, unknown>
  error?: { message: string; code?: number }
  message?: string
}

interface JsonRpcToolsResponse extends JsonRpcResponse {
  result?: { tools?: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }> } & Record<string, unknown>
}

class HttpMcpConnection implements McpConnection {
  public readonly tools: McpToolDefinition[] = []

  constructor(
    private readonly url: string,
    private readonly headers: Record<string, string>,
    tools: McpToolDefinition[],
  ) {
    this.tools = tools
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<McpToolCallResult> {
    const reqId = `sp-call-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const res = await fetch(this.url, {
      method: 'POST',
      headers: { ...this.headers, 'x-moo-request-id': reqId },
      body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method: 'tools/call', params: { name, arguments: args } }),
      signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + res.statusText)
    const data = await res.json() as JsonRpcResponse
    if (data.error) throw new Error(`MCP error: ${data.error.message}`)
    const result = data.result as unknown as McpToolCallResult
    return { content: result?.content || [], isError: Boolean(result?.isError) }
  }

  async close(): Promise<void> { /* HTTP connections are stateless */ }
}

class StdioMcpConnection implements McpConnection {
  public readonly tools: McpToolDefinition[] = []

  constructor(
    private readonly client: Client,
    private readonly transport: StdioClientTransport,
    tools: McpToolDefinition[],
  ) {
    this.tools = tools
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<McpToolCallResult> {
    const result = await this.client.callTool({ name, arguments: args })
    const content = result.content as Array<{ type: string; text?: string }> || []
    return { content, isError: Boolean(result.isError) }
  }

  async close(): Promise<void> {
    try { await this.client.close() } catch { /* ignore */ }
  }
}

export class McpClientFactoryImpl implements McpClientFactory {
  private async httpRequest(url: string, method: string, params: Record<string, unknown>, headers: Record<string, string>): Promise<Record<string, unknown>> {
    const reqId = `sp-${method.replace('/', '-')}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...headers, 'x-moo-request-id': reqId },
      body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
      signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + res.statusText)
    const data = await res.json() as JsonRpcResponse
    if (data.error) throw new Error(`MCP error: ${data.error.message}`)
    return data.result || {}
  }

  async connectHttp(url: string, extraHeaders?: Record<string, string>, clientName?: string): Promise<McpConnection> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(extraHeaders || {}) }

    await this.httpRequest(url, 'initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: clientName || 'supaproxy', version: '1.0.0' },
    }, headers)

    const toolsResult = await this.httpRequest(url, 'tools/list', {}, headers) as { tools?: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }> }
    const tools: McpToolDefinition[] = (toolsResult.tools || []).map(t => ({
      name: t.name,
      description: t.description || '',
      inputSchema: t.inputSchema || { type: 'object', properties: {} },
    }))

    return new HttpMcpConnection(url, headers, tools)
  }

  async connectStdio(command: string, args: string[], env?: Record<string, string>, clientName?: string): Promise<McpConnection> {
    const transport = new StdioClientTransport({
      command,
      args,
      env: { ...process.env, ...(env || {}) } as Record<string, string>,
    })

    const client = new Client({ name: clientName || 'supaproxy', version: '1.0.0' })
    await client.connect(transport)

    const toolsResult = await client.listTools()
    const tools: McpToolDefinition[] = toolsResult.tools.map(t => ({
      name: t.name,
      description: t.description || '',
      inputSchema: t.inputSchema,
    }))

    return new StdioMcpConnection(client, transport, tools)
  }

  async testHttp(url: string, extraHeaders?: Record<string, string>): Promise<{ ok: boolean; tools: number; server: string; toolNames: string[]; error?: string }> {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json', ...extraHeaders }
      const initResult = await this.httpRequest(url, 'initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'supaproxy-test', version: '1.0.0' },
      }, headers)

      const toolsResult = await this.httpRequest(url, 'tools/list', {}, headers) as { tools?: Array<{ name: string }> }
      const tools = toolsResult.tools || []
      const serverInfo = initResult.serverInfo as Record<string, unknown> | undefined
      return { ok: true, tools: tools.length, server: (serverInfo?.name as string) || 'unknown', toolNames: tools.map(t => t.name) }
    } catch (err) {
      return { ok: false, tools: 0, server: '', toolNames: [], error: `Connection failed: ${(err as Error).message}` }
    }
  }
}
