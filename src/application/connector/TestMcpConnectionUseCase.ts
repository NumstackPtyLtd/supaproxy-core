import type { McpClientFactory } from '../ports/McpClient.js'

interface TestResult {
  ok: boolean
  tools?: number
  server?: string
  toolNames?: string[]
  error?: string
}

export class TestMcpConnectionUseCase {
  constructor(private readonly mcpFactory: McpClientFactory) {}

  async execute(transport: string, url?: string, command?: string, headers?: Record<string, string>): Promise<TestResult> {
    if (transport === 'http') {
      if (!url) return { ok: false, error: 'Server URL is required' }
      try {
        return await this.mcpFactory.testHttp(url, headers)
      } catch (err) {
        const raw = (err as Error).message
        const error = raw === 'fetch failed'
          ? 'Could not reach the server. Check that the URL is correct and the service is running.'
          : raw
        return { ok: false, error }
      }
    }
    return { ok: false, error: 'STDIO connections are tested on first query.' }
  }
}
