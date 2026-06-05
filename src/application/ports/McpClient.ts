export interface McpToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface McpToolCallResult {
  content: Array<{ type: string; text?: string }>
  isError: boolean
}

export interface McpConnection {
  tools: McpToolDefinition[]
  callTool(name: string, args: Record<string, unknown>): Promise<McpToolCallResult>
  close(): Promise<void>
}

export interface McpClientFactory {
  connectHttp(url: string, headers?: Record<string, string>, clientName?: string): Promise<McpConnection>
  connectSse(url: string, headers?: Record<string, string>, clientName?: string): Promise<McpConnection>
  connectStdio(command: string, args: string[], env?: Record<string, string>, clientName?: string): Promise<McpConnection>
  testHttp(url: string, headers?: Record<string, string>): Promise<{ ok: boolean; tools: number; server: string; toolNames: string[]; error?: string }>
}
