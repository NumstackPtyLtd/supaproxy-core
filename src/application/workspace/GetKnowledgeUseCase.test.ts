import { describe, it, expect, vi } from 'vitest'
import { mockWorkspaceRepo, mockConversationQueryRepo } from '../../__tests__/mocks.js'
import { GetKnowledgeUseCase } from './GetKnowledgeUseCase.js'

describe('GetKnowledgeUseCase', () => {
  it('returns knowledge sources and parsed gaps', async () => {
    const wsRepo = mockWorkspaceRepo()
    const convRepo = mockConversationQueryRepo()
    vi.mocked(wsRepo.findKnowledge).mockResolvedValue([
      { id: 'k1', type: 'file', name: 'docs.pdf', config: '{}', status: 'synced', chunks: 10, last_synced_at: '2024-01-01' },
    ])
    vi.mocked(convRepo.getKnowledgeGapsByWorkspace).mockResolvedValue([
      { knowledge_gaps: JSON.stringify([{ topic: 'billing', description: 'No billing info' }]), conversation_id: 'c1', user_name: 'Alice', last_activity_at: '2024-01-01' },
    ])

    const useCase = new GetKnowledgeUseCase(wsRepo, convRepo)
    const result = await useCase.execute('ws-test')

    expect(result.knowledge).toHaveLength(1)
    expect(result.gaps).toHaveLength(1)
    expect(result.gaps[0].topic).toBe('billing')
    expect(result.gaps[0].conversation_id).toBe('c1')
    expect(result.gaps[0].user_name).toBe('Alice')
  })

  it('handles null knowledge_gaps gracefully', async () => {
    const wsRepo = mockWorkspaceRepo()
    const convRepo = mockConversationQueryRepo()
    vi.mocked(convRepo.getKnowledgeGapsByWorkspace).mockResolvedValue([
      { knowledge_gaps: null, conversation_id: 'c1', user_name: null, last_activity_at: null },
    ])

    const useCase = new GetKnowledgeUseCase(wsRepo, convRepo)
    const result = await useCase.execute('ws-test')

    expect(result.gaps).toHaveLength(0)
  })
})
