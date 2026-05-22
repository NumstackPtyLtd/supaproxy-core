import { describe, it, expect, vi } from 'vitest'
import { mockConversationQueryRepo } from '../../__tests__/mocks.js'
import { GetDashboardUseCase } from './GetDashboardUseCase.js'

describe('GetDashboardUseCase', () => {
  it('returns aggregated dashboard data', async () => {
    const convRepo = mockConversationQueryRepo()
    vi.mocked(convRepo.getTicketSummary).mockResolvedValue({ open: 5, cold: 2, closed_today: 3, closed_week: 10 })
    vi.mocked(convRepo.getSentimentDistribution).mockResolvedValue([
      { score: 4, count: 5 },
      { score: 5, count: 3 },
    ])
    vi.mocked(convRepo.getComplianceStats).mockResolvedValue([])
    vi.mocked(convRepo.getKnowledgeGapStats).mockResolvedValue([])
    vi.mocked(convRepo.getResolutionDistribution).mockResolvedValue([{ status: 'resolved', count: 8 }])
    vi.mocked(convRepo.getCategoryDistribution).mockResolvedValue([{ category: 'query', count: 6 }])
    vi.mocked(convRepo.getChannelDistribution).mockResolvedValue([{ consumer_type: 'slack', count: 4 }])
    vi.mocked(convRepo.getCostAndUsage).mockResolvedValue({ cost_today: 1.5, cost_week: 5, cost_month: 20, q_today: 10, q_week: 50, q_month: 200 })
    vi.mocked(convRepo.getRecentConversations).mockResolvedValue([])

    const useCase = new GetDashboardUseCase(convRepo)
    const result = await useCase.execute('ws-test')

    expect(result.tickets.open).toBe(5)
    expect(result.sentiment.average).toBe(4.4)
    expect(result.sentiment.distribution[4]).toBe(5)
    expect(result.resolution.resolved).toBe(8)
    expect(result.categories.query).toBe(6)
    expect(result.channels.slack).toBe(4)
    expect(result.cost.today).toBe(1.5)
    expect(result.usage.queries_today).toBe(10)
  })

  it('builds compliance violations from JSON strings', async () => {
    const convRepo = mockConversationQueryRepo()
    vi.mocked(convRepo.getComplianceStats).mockResolvedValue([
      { compliance_violations: JSON.stringify([{ rule: 'PII', description: 'Leaked email' }]), conversation_id: 'c1', created_at: '2024-01-01' },
    ])

    const useCase = new GetDashboardUseCase(convRepo)
    const result = await useCase.execute('ws-test')

    expect(result.compliance.total_violations).toBe(1)
    expect(result.compliance.recent[0].rule).toBe('PII')
    expect(result.compliance.by_rule.PII).toBe(1)
  })

  it('builds knowledge gaps from JSON strings', async () => {
    const convRepo = mockConversationQueryRepo()
    vi.mocked(convRepo.getKnowledgeGapStats).mockResolvedValue([
      { knowledge_gaps: JSON.stringify([{ topic: 'billing' }]), created_at: '2024-01-01' },
      { knowledge_gaps: JSON.stringify([{ topic: 'billing' }, { topic: 'returns' }]), created_at: '2024-01-02' },
    ])

    const useCase = new GetDashboardUseCase(convRepo)
    const result = await useCase.execute('ws-test')

    expect(result.knowledge_gaps.topics[0].topic).toBe('billing')
    expect(result.knowledge_gaps.topics[0].count).toBe(2)
    expect(result.knowledge_gaps.topics[1].topic).toBe('returns')
  })

  it('handles zero sentiment data', async () => {
    const convRepo = mockConversationQueryRepo()
    const useCase = new GetDashboardUseCase(convRepo)
    const result = await useCase.execute('ws-test')

    expect(result.sentiment.average).toBe(0)
  })
})
