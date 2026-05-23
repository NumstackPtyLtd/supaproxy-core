import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  mockConversationRepo, mockOrgRepo, mockQueueService, mockPosterRegistry,
} from '../../__tests__/mocks.js'
import { LifecycleUseCase } from './LifecycleUseCase.js'
import { StatsGenerator } from './StatsGenerator.js'
import type { registry as ProviderRegistryType, ProviderPlugin } from '@supaproxy/providers'
import type { ColdTransitionData, ConversationStatsData } from '../../domain/conversation/repository.js'

function mockProviderPlugin(): ProviderPlugin {
  return {
    type: 'mock',
    name: 'Mock Provider',
    description: 'Test',
    configSchema: { fields: [] },
    models: [{ id: 'mock-model', label: 'Mock', default: true }],
    setApiKey: vi.fn(),
    createMessage: vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'response' }],
      usage: { input_tokens: 10, output_tokens: 5, cost_usd: 0.0001 },
      stop_reason: 'end_turn',
    }),
    createSimpleMessage: vi.fn().mockResolvedValue('AI response'),
  }
}

function mockProviderRegistry(plugin?: ProviderPlugin): typeof ProviderRegistryType {
  const p = plugin || mockProviderPlugin()
  return { get: vi.fn().mockReturnValue(p) } as unknown as typeof ProviderRegistryType
}

function mockSettingValues(store: Record<string, string>) {
  return async (keys: string[]) => {
    const result: Record<string, string> = {}
    for (const k of keys) result[k] = store[k] || ''
    return result
  }
}

describe('LifecycleUseCase', () => {
  let conversationRepo: ReturnType<typeof mockConversationRepo>
  let orgRepo: ReturnType<typeof mockOrgRepo>
  let queueService: ReturnType<typeof mockQueueService>
  let providerPlugin: ProviderPlugin
  let providerRegistry: typeof ProviderRegistryType
  let posterRegistry: ReturnType<typeof mockPosterRegistry>
  let useCase: LifecycleUseCase

  beforeEach(() => {
    conversationRepo = mockConversationRepo()
    orgRepo = mockOrgRepo()
    queueService = mockQueueService()
    providerPlugin = mockProviderPlugin()
    providerRegistry = mockProviderRegistry(providerPlugin)
    posterRegistry = mockPosterRegistry()
    const resolveProviderSafe = async (pt: string | null) => {
      const orgSettings = await orgRepo.getSettingValues(['ai_provider_type'])
      const providerType = pt || orgSettings['ai_provider_type']
      if (!providerType) return null
      const keySettings = await orgRepo.getSettingValues([`${providerType}_api_key`, 'ai_api_key'])
      const apiKey = keySettings[`${providerType}_api_key`] || keySettings['ai_api_key'] || null
      if (!apiKey) return null
      return { provider: providerRegistry.get(providerType), apiKey }
    }
    const statsGenerator = new StatsGenerator(conversationRepo, resolveProviderSafe)
    useCase = new LifecycleUseCase(conversationRepo, orgRepo, queueService, providerRegistry, posterRegistry, statsGenerator)
  })

  // ── runLifecycleScan ──

  describe('runLifecycleScan', () => {
    it('transitions cold candidates and queues cold messages', async () => {
      const coldConvos: ColdTransitionData[] = [
        { id: 'conv-1', channel: 'C123', external_thread_id: 'thread-1', consumer_type: 'slack' },
        { id: 'conv-2', channel: 'C456', external_thread_id: 'thread-2', consumer_type: 'whatsapp' },
      ]
      vi.mocked(conversationRepo.findColdTransitionCandidates).mockResolvedValue(coldConvos)
      vi.mocked(conversationRepo.findCloseTransitionCandidates).mockResolvedValue([])

      await useCase.runLifecycleScan()

      expect(conversationRepo.batchTransitionToCold).toHaveBeenCalledWith(['conv-1', 'conv-2'])
      expect(queueService.addJob).toHaveBeenCalledTimes(2)
      expect(queueService.addJob).toHaveBeenCalledWith(
        'cold-messages', 'send-cold-message',
        expect.objectContaining({ conversationId: 'conv-1', consumerType: 'slack' }),
      )
    })

    it('transitions close candidates and queues stats jobs', async () => {
      vi.mocked(conversationRepo.findColdTransitionCandidates).mockResolvedValue([])
      vi.mocked(conversationRepo.findCloseTransitionCandidates).mockResolvedValue(['conv-3', 'conv-4'])

      await useCase.runLifecycleScan()

      expect(conversationRepo.batchTransitionToClosed).toHaveBeenCalledWith(['conv-3', 'conv-4'])
      expect(queueService.addJob).toHaveBeenCalledTimes(2)
      expect(queueService.addJob).toHaveBeenCalledWith('conversation-stats', 'generate-stats', { conversationId: 'conv-3' })
      expect(queueService.addJob).toHaveBeenCalledWith('conversation-stats', 'generate-stats', { conversationId: 'conv-4' })
    })

    it('does nothing when no candidates exist', async () => {
      vi.mocked(conversationRepo.findColdTransitionCandidates).mockResolvedValue([])
      vi.mocked(conversationRepo.findCloseTransitionCandidates).mockResolvedValue([])

      await useCase.runLifecycleScan()

      expect(conversationRepo.batchTransitionToCold).not.toHaveBeenCalled()
      expect(conversationRepo.batchTransitionToClosed).not.toHaveBeenCalled()
      expect(queueService.addJob).not.toHaveBeenCalled()
    })
  })

  // ── sendColdMessage ──

  describe('sendColdMessage', () => {
    const target = {
      conversationId: 'conv-1',
      consumerType: 'slack',
      channel: 'C123',
      externalThreadId: 'thread-1',
    }

    it('generates and posts a cold message via AI', async () => {
      vi.mocked(conversationRepo.findMessages).mockResolvedValue([
        { role: 'user', content: 'I need help' },
        { role: 'assistant', content: 'Sure, what do you need?' },
      ])
      vi.mocked(orgRepo.getSettingValues).mockImplementation(mockSettingValues({
        ai_provider_type: 'anthropic',
        anthropic_api_key: 'sk-test',
      }))
      vi.mocked(conversationRepo.getWorkspaceProviderInfo).mockResolvedValue({ model: 'claude-sonnet-4-20250514', provider_type: null })
      vi.mocked(providerPlugin.createSimpleMessage).mockResolvedValue('Still need help?')

      await useCase.sendColdMessage(target)

      expect(providerPlugin.createSimpleMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: 'sk-test',
          maxTokens: 150,
        }),
      )
      expect(posterRegistry.post).toHaveBeenCalledWith(target, 'Still need help?')
    })

    it('uses fallback message when no messages exist', async () => {
      vi.mocked(conversationRepo.findMessages).mockResolvedValue([])

      await useCase.sendColdMessage(target)

      expect(posterRegistry.post).toHaveBeenCalledWith(
        target,
        expect.stringContaining('checking in'),
      )
    })

    it('uses fallback message when no API key is configured', async () => {
      vi.mocked(conversationRepo.findMessages).mockResolvedValue([
        { role: 'user', content: 'hello' },
      ])
      vi.mocked(orgRepo.getSettingValues).mockImplementation(mockSettingValues({
        ai_provider_type: 'anthropic',
      }))
      vi.mocked(conversationRepo.getWorkspaceProviderInfo).mockResolvedValue({ model: 'claude-sonnet-4-20250514', provider_type: null })

      await useCase.sendColdMessage(target)

      expect(posterRegistry.post).toHaveBeenCalledWith(
        target,
        expect.stringContaining('checking in'),
      )
    })

    it('uses fallback message when no model is configured', async () => {
      vi.mocked(conversationRepo.findMessages).mockResolvedValue([
        { role: 'user', content: 'hello' },
      ])
      vi.mocked(conversationRepo.getWorkspaceProviderInfo).mockResolvedValue(null)

      await useCase.sendColdMessage(target)

      expect(posterRegistry.post).toHaveBeenCalledWith(
        target,
        expect.stringContaining('checking in'),
      )
    })

    it('uses fallback when no provider type is configured', async () => {
      vi.mocked(conversationRepo.findMessages).mockResolvedValue([
        { role: 'user', content: 'hello' },
      ])
      vi.mocked(orgRepo.getSettingValues).mockImplementation(mockSettingValues({}))
      vi.mocked(conversationRepo.getWorkspaceProviderInfo).mockResolvedValue({ model: 'claude-sonnet-4-20250514', provider_type: null })

      await useCase.sendColdMessage(target)

      expect(posterRegistry.post).toHaveBeenCalledWith(
        target,
        expect.stringContaining('checking in'),
      )
    })
  })

  // ── generateStats ──

  describe('generateStats', () => {
    beforeEach(() => {
      vi.mocked(orgRepo.getSettingValues).mockImplementation(mockSettingValues({
        ai_provider_type: 'anthropic',
        anthropic_api_key: 'sk-test',
      }))
      vi.mocked(conversationRepo.getWorkspaceProviderInfo).mockResolvedValue({ model: 'claude-sonnet-4-20250514', provider_type: null })
    })

    it('creates stats and completes with AI analysis', async () => {
      vi.mocked(conversationRepo.findStats).mockResolvedValue(null)
      vi.mocked(conversationRepo.findMessages).mockResolvedValue([
        { role: 'user', content: 'My claim was denied' },
        { role: 'assistant', content: 'Let me check that for you.' },
      ])
      vi.mocked(conversationRepo.getAggregateData).mockResolvedValue({
        total_tokens_input: 200, total_tokens_output: 100,
        total_cost_usd: 0.002, total_duration_ms: 500, query_count: 1,
      })
      vi.mocked(conversationRepo.getTimestamps).mockResolvedValue({
        first_message_at: '2024-01-01T10:00:00Z',
        closed_at: '2024-01-01T10:05:00Z',
        message_count: 2,
      })
      vi.mocked(conversationRepo.getWorkspaceProviderInfo).mockResolvedValue({ model: 'claude-sonnet-4-20250514', provider_type: null })

      const analysisJson = JSON.stringify({
        sentiment_score: 3,
        resolution_status: 'resolved',
        category: 'support',
        compliance_violations: [],
        knowledge_gaps: [],
        fraud_indicators: [],
        tools_used: ['check_claim'],
        summary: 'User asked about a denied claim.',
      })
      vi.mocked(providerPlugin.createSimpleMessage).mockResolvedValue(analysisJson)

      await useCase.generateStats('conv-1')

      expect(conversationRepo.createStats).toHaveBeenCalledWith(expect.any(String), 'conv-1')
      expect(conversationRepo.updateStatsComplete).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          sentimentScore: 3,
          resolutionStatus: 'resolved',
          category: 'support',
          totalTokensInput: 200,
          totalTokensOutput: 100,
          messageCount: 2,
          durationSeconds: 300,
          summary: 'User asked about a denied claim.',
        }),
      )
    })

    it('skips when stats already complete', async () => {
      vi.mocked(conversationRepo.findStats).mockResolvedValue({
        id: 'stats-1',
        conversation_id: 'conv-1',
        stats_status: 'complete',
      } as ConversationStatsData)

      await useCase.generateStats('conv-1')

      expect(conversationRepo.createStats).not.toHaveBeenCalled()
      expect(conversationRepo.updateStatsComplete).not.toHaveBeenCalled()
    })

    it('reuses existing stats record if not complete', async () => {
      vi.mocked(conversationRepo.findStats).mockResolvedValue({
        id: 'stats-existing',
        conversation_id: 'conv-1',
        stats_status: 'pending',
      } as ConversationStatsData)
      vi.mocked(conversationRepo.findMessages).mockResolvedValue([
        { role: 'user', content: 'hello' },
      ])
      vi.mocked(conversationRepo.getAggregateData).mockResolvedValue({
        total_tokens_input: 10, total_tokens_output: 5,
        total_cost_usd: 0.0001, total_duration_ms: 100, query_count: 1,
      })
      vi.mocked(conversationRepo.getTimestamps).mockResolvedValue({
        first_message_at: '2024-01-01T10:00:00Z',
        closed_at: '2024-01-01T10:01:00Z',
        message_count: 1,
      })
      vi.mocked(conversationRepo.getWorkspaceProviderInfo).mockResolvedValue({ model: 'claude-sonnet-4-20250514', provider_type: null })
      vi.mocked(providerPlugin.createSimpleMessage).mockResolvedValue(
        JSON.stringify({ sentiment_score: 4, resolution_status: 'resolved', category: 'query', compliance_violations: [], knowledge_gaps: [], fraud_indicators: [], tools_used: [], summary: 'Test' }),
      )

      await useCase.generateStats('conv-1')

      expect(conversationRepo.createStats).not.toHaveBeenCalled()
      expect(conversationRepo.updateStatsComplete).toHaveBeenCalledWith(
        'stats-existing',
        expect.any(Object),
      )
    })

    it('marks stats as failed when no messages exist', async () => {
      vi.mocked(conversationRepo.findStats).mockResolvedValue(null)
      vi.mocked(conversationRepo.findMessages).mockResolvedValue([])

      await useCase.generateStats('conv-1')

      expect(conversationRepo.updateStatsStatus).toHaveBeenCalledWith(expect.any(String), 'failed')
    })

    it('marks stats as failed when no model is configured', async () => {
      vi.mocked(conversationRepo.findStats).mockResolvedValue(null)
      vi.mocked(conversationRepo.findMessages).mockResolvedValue([
        { role: 'user', content: 'hello' },
      ])
      vi.mocked(conversationRepo.getAggregateData).mockResolvedValue({
        total_tokens_input: 10, total_tokens_output: 5,
        total_cost_usd: 0.0001, total_duration_ms: 100, query_count: 1,
      })
      vi.mocked(conversationRepo.getTimestamps).mockResolvedValue({
        first_message_at: '2024-01-01T10:00:00Z',
        closed_at: '2024-01-01T10:01:00Z',
        message_count: 1,
      })
      vi.mocked(conversationRepo.getWorkspaceProviderInfo).mockResolvedValue(null)

      await useCase.generateStats('conv-1')

      expect(conversationRepo.updateStatsStatus).toHaveBeenCalledWith(expect.any(String), 'failed')
    })

    it('marks stats as failed when no API key is configured', async () => {
      vi.mocked(conversationRepo.findStats).mockResolvedValue(null)
      vi.mocked(conversationRepo.findMessages).mockResolvedValue([
        { role: 'user', content: 'hello' },
      ])
      vi.mocked(conversationRepo.getAggregateData).mockResolvedValue({
        total_tokens_input: 10, total_tokens_output: 5,
        total_cost_usd: 0.0001, total_duration_ms: 100, query_count: 1,
      })
      vi.mocked(conversationRepo.getTimestamps).mockResolvedValue({
        first_message_at: null, closed_at: null, message_count: 1,
      })
      vi.mocked(conversationRepo.getWorkspaceProviderInfo).mockResolvedValue({ model: 'claude-sonnet-4-20250514', provider_type: null })
      vi.mocked(orgRepo.getSettingValues).mockImplementation(mockSettingValues({
        ai_provider_type: 'anthropic',
      }))

      await useCase.generateStats('conv-1')

      expect(conversationRepo.updateStatsStatus).toHaveBeenCalledWith(expect.any(String), 'failed')
    })

    it('marks stats as failed when AI analysis throws', async () => {
      vi.mocked(conversationRepo.findStats).mockResolvedValue(null)
      vi.mocked(conversationRepo.findMessages).mockResolvedValue([
        { role: 'user', content: 'hello' },
      ])
      vi.mocked(conversationRepo.getAggregateData).mockResolvedValue({
        total_tokens_input: 10, total_tokens_output: 5,
        total_cost_usd: 0.0001, total_duration_ms: 100, query_count: 1,
      })
      vi.mocked(conversationRepo.getTimestamps).mockResolvedValue({
        first_message_at: '2024-01-01T10:00:00Z',
        closed_at: '2024-01-01T10:01:00Z',
        message_count: 1,
      })
      vi.mocked(conversationRepo.getWorkspaceProviderInfo).mockResolvedValue({ model: 'claude-sonnet-4-20250514', provider_type: null })
      vi.mocked(providerPlugin.createSimpleMessage).mockRejectedValue(new Error('AI failed'))

      await useCase.generateStats('conv-1')

      expect(conversationRepo.updateStatsStatus).toHaveBeenCalledWith(expect.any(String), 'failed')
    })

    it('handles markdown-wrapped JSON from AI provider', async () => {
      vi.mocked(conversationRepo.findStats).mockResolvedValue(null)
      vi.mocked(conversationRepo.findMessages).mockResolvedValue([
        { role: 'user', content: 'hello' },
      ])
      vi.mocked(conversationRepo.getAggregateData).mockResolvedValue({
        total_tokens_input: 10, total_tokens_output: 5,
        total_cost_usd: 0.0001, total_duration_ms: 100, query_count: 1,
      })
      vi.mocked(conversationRepo.getTimestamps).mockResolvedValue({
        first_message_at: '2024-01-01T10:00:00Z',
        closed_at: '2024-01-01T10:01:00Z',
        message_count: 1,
      })
      vi.mocked(conversationRepo.getWorkspaceProviderInfo).mockResolvedValue({ model: 'claude-sonnet-4-20250514', provider_type: null })

      const wrappedJson = '```json\n' + JSON.stringify({
        sentiment_score: 5,
        resolution_status: 'resolved',
        category: 'query',
        compliance_violations: [],
        knowledge_gaps: [],
        fraud_indicators: [],
        tools_used: [],
        summary: 'Simple question.',
      }) + '\n```'
      vi.mocked(providerPlugin.createSimpleMessage).mockResolvedValue(wrappedJson)

      await useCase.generateStats('conv-1')

      expect(conversationRepo.updateStatsComplete).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ sentimentScore: 5 }),
      )
    })
  })
})
