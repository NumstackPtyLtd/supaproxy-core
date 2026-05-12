import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../config.js', () => ({
  IS_PRODUCTION: false,
}))

import {
  mockWorkspaceRepo, mockOrgRepo, mockAuditRepo, mockMcpFactory,
  stubWorkspace,
} from '../../__tests__/mocks.js'
import { ExecuteQueryUseCase } from './ExecuteQueryUseCase.js'
import type { ManageConversationUseCase } from '../conversation/ManageConversationUseCase.js'
import type { registry as ProviderRegistryType, ProviderPlugin } from '@supaproxy/providers'
import type { GuardrailPlugin } from '@supaproxy/guardrails'
import { NotFoundError } from '../../domain/shared/errors.js'

// ── Local helpers ──

function mockProviderPlugin(overrides: Partial<ProviderPlugin> = {}): ProviderPlugin {
  return {
    type: 'mock',
    name: 'Mock Provider',
    description: 'Test provider',
    configSchema: { fields: [] },
    models: [{ id: 'mock-model', label: 'Mock Model', default: true }],
    setApiKey: vi.fn(),
    createMessage: vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'AI response' }],
      usage: { input_tokens: 100, output_tokens: 50, cost_usd: 0.001050 },
      stop_reason: 'end_turn',
    }),
    createSimpleMessage: vi.fn().mockResolvedValue('AI response'),
    ...overrides,
  }
}

function mockProviderRegistry(plugin?: ProviderPlugin): typeof ProviderRegistryType {
  const p = plugin || mockProviderPlugin()
  return { get: vi.fn().mockReturnValue(p) } as unknown as typeof ProviderRegistryType
}

function mockConversationUseCase(): ManageConversationUseCase {
  return {
    findOrCreate: vi.fn().mockResolvedValue('conv-1'),
    recordMessage: vi.fn().mockResolvedValue(undefined),
    getHistory: vi.fn().mockResolvedValue([]),
    setRouting: vi.fn().mockResolvedValue(undefined),
  } as unknown as ManageConversationUseCase
}

const baseMeta = {
  consumerType: 'api',
  userId: 'user-1',
  userName: 'Test User',
}

describe('ExecuteQueryUseCase', () => {
  let workspaceRepo: ReturnType<typeof mockWorkspaceRepo>
  let orgRepo: ReturnType<typeof mockOrgRepo>
  let auditRepo: ReturnType<typeof mockAuditRepo>
  let mcpFactory: ReturnType<typeof mockMcpFactory>
  let provider: ProviderPlugin
  let providerRegistry: typeof ProviderRegistryType
  let conversationUseCase: ReturnType<typeof mockConversationUseCase>
  let resolveGuardrails: ReturnType<typeof vi.fn>

  function buildUseCase() {
    return new ExecuteQueryUseCase(
      workspaceRepo,
      orgRepo,
      auditRepo,
      providerRegistry,
      mcpFactory,
      conversationUseCase,
      resolveGuardrails,
    )
  }

  beforeEach(() => {
    workspaceRepo = mockWorkspaceRepo()
    orgRepo = mockOrgRepo()
    auditRepo = mockAuditRepo()
    mcpFactory = mockMcpFactory()
    provider = mockProviderPlugin()
    providerRegistry = mockProviderRegistry(provider)
    conversationUseCase = mockConversationUseCase()
    resolveGuardrails = vi.fn().mockResolvedValue([])

    // Default: workspace exists with model set
    vi.mocked(workspaceRepo.findActiveById).mockResolvedValue(
      stubWorkspace({ id: 'ws-test', model: 'claude-sonnet-4-20250514' }),
    )

    // Default: org has an AI provider configured
    vi.mocked(orgRepo.getSettingValues).mockResolvedValue({
      ai_provider_type: 'anthropic',
      ai_api_key: 'sk-test-key',
      anthropic_api_key: '',
    })
  })

  it('throws NotFoundError when workspace does not exist', async () => {
    vi.mocked(workspaceRepo.findActiveById).mockResolvedValue(null)
    const useCase = buildUseCase()

    await expect(useCase.execute('ws-missing', 'hello', baseMeta))
      .rejects.toThrow(NotFoundError)
  })

  it('returns error message when no AI provider is configured', async () => {
    vi.mocked(orgRepo.getSettingValues).mockResolvedValue({
      ai_provider_type: '',
      ai_api_key: '',
      anthropic_api_key: '',
    })
    const useCase = buildUseCase()

    const result = await useCase.execute('ws-test', 'hello', baseMeta)

    expect(result.error).toBe('no_api_key')
    expect(result.answer).toContain('No AI provider connected')
  })

  it('returns error when API key is missing', async () => {
    vi.mocked(orgRepo.getSettingValues).mockResolvedValue({
      ai_provider_type: 'anthropic',
      ai_api_key: '',
      anthropic_api_key: '',
    })
    const useCase = buildUseCase()

    const result = await useCase.execute('ws-test', 'hello', baseMeta)

    expect(result.error).toBe('no_api_key')
    expect(result.answer).toContain('No AI provider connected')
  })

  it('runs direct LLM conversation when no tools are discovered', async () => {
    vi.mocked(workspaceRepo.findConnectionConfigs).mockResolvedValue([])
    const useCase = buildUseCase()

    const result = await useCase.execute('ws-test', 'hello', baseMeta)

    expect(result.answer).toBe('AI response')
    expect(result.toolsCalled).toEqual([])
    expect(result.tokensInput).toBe(100)
    expect(result.tokensOutput).toBe(50)
    expect(result.costUsd).toBeCloseTo(0.00105)
    expect(result.error).toBeNull()
  })

  it('runs agent loop with tools when connections exist', async () => {
    vi.mocked(workspaceRepo.findConnectionConfigs).mockResolvedValue([
      { name: 'test-mcp', type: 'mcp', config: '{"transport":"http","url":"http://localhost:8080"}' },
    ])

    // First call returns tool_use, second returns text
    vi.mocked(provider.createMessage)
      .mockResolvedValueOnce({
        content: [
          { type: 'tool_use', id: 'tu-1', name: 'test-tool', input: { query: 'test' } },
        ],
        usage: { input_tokens: 80, output_tokens: 30, cost_usd: 0.0005 },
        stop_reason: 'tool_use',
      })
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Final answer based on tool result' }],
        usage: { input_tokens: 120, output_tokens: 60, cost_usd: 0.0008 },
        stop_reason: 'end_turn',
      })

    const useCase = buildUseCase()
    const result = await useCase.execute('ws-test', 'Use the tool', baseMeta)

    expect(result.answer).toBe('Final answer based on tool result')
    expect(result.toolsCalled).toContain('test-tool')
    expect(result.tokensInput).toBe(200)
    expect(result.tokensOutput).toBe(90)
    expect(provider.createMessage).toHaveBeenCalledTimes(2)
  })

  it('blocks query when guardrail returns block action', async () => {
    const guardrail: GuardrailPlugin = {
      id: 'pattern',
      name: 'test-guard',
      description: 'Test',
      version: '0.1.0',
      author: 'test',
      stage: 'pre-llm',
      configSchema: { fields: [] },
      process: vi.fn().mockResolvedValue({
        action: 'block',
        reason: 'Blocked by policy',
        annotations: ['harmful'],
      }),
    }
    resolveGuardrails.mockResolvedValue([guardrail])

    const useCase = buildUseCase()
    const result = await useCase.execute('ws-test', 'bad query', baseMeta)

    expect(result.error).toBe('input_blocked')
    expect(result.answer).toBe('Blocked by policy')
    // Audit log should still be written for blocked queries
    expect(auditRepo.create).toHaveBeenCalled()
    // Provider should NOT be called
    expect(provider.createMessage).not.toHaveBeenCalled()
  })

  it('uses modified query when guardrail modifies input', async () => {
    const guardrail: GuardrailPlugin = {
      id: 'pattern',
      name: 'sanitiser',
      description: 'Sanitise',
      version: '0.1.0',
      author: 'test',
      stage: 'pre-llm',
      configSchema: { fields: [] },
      process: vi.fn().mockResolvedValue({
        action: 'pass',
        query: 'sanitised query',
        annotations: ['redacted'],
      }),
    }
    resolveGuardrails.mockResolvedValue([guardrail])
    vi.mocked(workspaceRepo.findConnectionConfigs).mockResolvedValue([])

    const useCase = buildUseCase()
    await useCase.execute('ws-test', 'original query', baseMeta)

    // The provider should receive the sanitised query in the messages
    const createMessageCall = vi.mocked(provider.createMessage).mock.calls[0][0]
    const userMessages = createMessageCall.messages.filter((m: { role: string }) => m.role === 'user')
    expect(userMessages[userMessages.length - 1].content).toBe('sanitised query')
  })

  it('appends scope enforcement clause for non-default workspaces', async () => {
    vi.mocked(workspaceRepo.findActiveById).mockResolvedValue(
      stubWorkspace({ id: 'ws-test', is_default: false, system_prompt: 'You help with insurance.' }),
    )
    vi.mocked(workspaceRepo.findConnectionConfigs).mockResolvedValue([])

    const useCase = buildUseCase()
    await useCase.execute('ws-test', 'hello', baseMeta)

    const createMessageCall = vi.mocked(provider.createMessage).mock.calls[0][0]
    expect(createMessageCall.system).toContain('SCOPE RULE')
    expect(createMessageCall.system).toContain('You help with insurance.')
  })

  it('does not append scope enforcement for default workspaces', async () => {
    vi.mocked(workspaceRepo.findActiveById).mockResolvedValue(
      stubWorkspace({ id: 'ws-general', is_default: true, system_prompt: 'You are a receptionist.' }),
    )
    vi.mocked(workspaceRepo.findConnectionConfigs).mockResolvedValue([])

    const useCase = buildUseCase()
    await useCase.execute('ws-general', 'hello', baseMeta)

    const createMessageCall = vi.mocked(provider.createMessage).mock.calls[0][0]
    expect(createMessageCall.system).toBe('You are a receptionist.')
    expect(createMessageCall.system).not.toContain('SCOPE RULE')
  })

  it('uses systemPromptOverride when provided', async () => {
    vi.mocked(workspaceRepo.findConnectionConfigs).mockResolvedValue([])

    const useCase = buildUseCase()
    await useCase.execute('ws-test', 'hello', {
      ...baseMeta,
      systemPromptOverride: 'Custom prompt',
    })

    const createMessageCall = vi.mocked(provider.createMessage).mock.calls[0][0]
    expect(createMessageCall.system).toBe('Custom prompt')
    expect(createMessageCall.system).not.toContain('SCOPE RULE')
  })

  it('skips tool discovery when skipTools is true', async () => {
    const useCase = buildUseCase()
    await useCase.execute('ws-test', 'hello', {
      ...baseMeta,
      skipTools: true,
    })

    expect(workspaceRepo.findConnectionConfigs).not.toHaveBeenCalled()
    expect(mcpFactory.connectHttp).not.toHaveBeenCalled()
  })

  it('writes audit log after successful query', async () => {
    vi.mocked(workspaceRepo.findConnectionConfigs).mockResolvedValue([])

    const useCase = buildUseCase()
    await useCase.execute('ws-test', 'hello', baseMeta)

    expect(auditRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: 'ws-test',
        query: 'hello',
        consumer_type: 'api',
      }),
    )
  })

  it('records user and assistant messages', async () => {
    vi.mocked(workspaceRepo.findConnectionConfigs).mockResolvedValue([])

    const useCase = buildUseCase()
    await useCase.execute('ws-test', 'hello', baseMeta)

    expect(conversationUseCase.recordMessage).toHaveBeenCalledTimes(2)
    expect(conversationUseCase.recordMessage).toHaveBeenCalledWith('conv-1', 'user', 'hello')
    expect(conversationUseCase.recordMessage).toHaveBeenCalledWith('conv-1', 'assistant', 'AI response', expect.any(String))
  })

  it('records routing metadata when routedFrom is provided', async () => {
    vi.mocked(workspaceRepo.findConnectionConfigs).mockResolvedValue([])

    const useCase = buildUseCase()
    await useCase.execute('ws-test', 'hello', {
      ...baseMeta,
      routedFrom: '#general',
    })

    expect(conversationUseCase.setRouting).toHaveBeenCalledWith(
      'conv-1', '#general', 'Test Workspace', '',
    )
  })

  it('uses existing conversationId and sessionId from meta', async () => {
    vi.mocked(workspaceRepo.findConnectionConfigs).mockResolvedValue([])

    const useCase = buildUseCase()
    const result = await useCase.execute('ws-test', 'hello', {
      ...baseMeta,
      conversationId: 'conv-existing',
      sessionId: 'session-existing',
    })

    expect(result.conversationId).toBe('conv-existing')
    expect(result.sessionId).toBe('session-existing')
    // Should not call findOrCreate when conversationId is provided
    expect(conversationUseCase.findOrCreate).not.toHaveBeenCalled()
  })

  it('includes history in messages sent to provider', async () => {
    vi.mocked(workspaceRepo.findConnectionConfigs).mockResolvedValue([])
    vi.mocked(conversationUseCase.getHistory).mockResolvedValue([
      { role: 'user', content: 'previous question' },
      { role: 'assistant', content: 'previous answer' },
    ])

    const useCase = buildUseCase()
    await useCase.execute('ws-test', 'follow-up', baseMeta)

    const createMessageCall = vi.mocked(provider.createMessage).mock.calls[0][0]
    expect(createMessageCall.messages).toEqual([
      { role: 'user', content: 'previous question' },
      { role: 'assistant', content: 'previous answer' },
      { role: 'user', content: 'follow-up' },
    ])
  })

  it('closes MCP connections after query completes', async () => {
    vi.mocked(workspaceRepo.findConnectionConfigs).mockResolvedValue([
      { name: 'test-mcp', type: 'mcp', config: '{"transport":"http","url":"http://localhost:8080"}' },
    ])

    const mockConn = {
      tools: [{ name: 'test-tool', description: 'A test tool', inputSchema: { type: 'object', properties: {} } }],
      callTool: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'result' }], isError: false }),
      close: vi.fn().mockResolvedValue(undefined),
    }
    vi.mocked(mcpFactory.connectHttp).mockResolvedValue(mockConn)

    const useCase = buildUseCase()
    await useCase.execute('ws-test', 'hello', baseMeta)

    expect(mockConn.close).toHaveBeenCalled()
  })

  it('closes MCP connections even when query fails', async () => {
    vi.mocked(workspaceRepo.findConnectionConfigs).mockResolvedValue([
      { name: 'test-mcp', type: 'mcp', config: '{"transport":"http","url":"http://localhost:8080"}' },
    ])

    const mockConn = {
      tools: [{ name: 'test-tool', description: 'A test', inputSchema: { type: 'object', properties: {} } }],
      callTool: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    }
    vi.mocked(mcpFactory.connectHttp).mockResolvedValue(mockConn)
    vi.mocked(provider.createMessage).mockRejectedValue(new Error('LLM failed'))

    const useCase = buildUseCase()
    const result = await useCase.execute('ws-test', 'hello', baseMeta)

    expect(mockConn.close).toHaveBeenCalled()
    expect(result.error).toBe('LLM failed')
  })

  it('handles MCP connection failure gracefully', async () => {
    vi.mocked(workspaceRepo.findConnectionConfigs).mockResolvedValue([
      { name: 'broken-mcp', type: 'mcp', config: '{"transport":"http","url":"http://broken:9999"}' },
    ])
    vi.mocked(mcpFactory.connectHttp).mockRejectedValue(new Error('Connection refused'))

    const useCase = buildUseCase()
    const result = await useCase.execute('ws-test', 'hello', baseMeta)

    // Should still succeed as a direct conversation (no tools)
    expect(result.answer).toBe('AI response')
    expect(result.error).toBeNull()
  })

  it('returns error answer when provider.createMessage throws', async () => {
    vi.mocked(workspaceRepo.findConnectionConfigs).mockResolvedValue([])
    vi.mocked(provider.createMessage).mockRejectedValue(new Error('Rate limit exceeded'))

    const useCase = buildUseCase()
    const result = await useCase.execute('ws-test', 'hello', baseMeta)

    expect(result.error).toBe('Rate limit exceeded')
    expect(result.answer).toContain('Rate limit exceeded')
  })
})
