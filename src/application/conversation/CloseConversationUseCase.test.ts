import { describe, it, expect, vi } from 'vitest'
import { mockConversationRepo, mockQueueService, stubConversation } from '../../__tests__/mocks.js'
import { CloseConversationUseCase } from './CloseConversationUseCase.js'
import { NotFoundError } from '../../domain/shared/errors.js'
import { ConversationStatus } from '../../domain/conversation/ConversationStatus.js'
import { StatsStatus } from '../../domain/conversation/StatsStatus.js'

describe('CloseConversationUseCase', () => {
  it('closes conversation and queues stats', async () => {
    const repo = mockConversationRepo()
    const queue = mockQueueService()
    const conv = stubConversation({ status: ConversationStatus.OPEN })

    vi.mocked(repo.findById).mockResolvedValue(conv)
    vi.mocked(repo.findStats).mockResolvedValue(null)

    const uc = new CloseConversationUseCase(repo, queue)
    await uc.execute('conv-1')

    expect(repo.closeConversation).toHaveBeenCalledWith('conv-1')
    expect(repo.createStats).toHaveBeenCalledWith(expect.any(String), 'conv-1')
    expect(queue.addJob).toHaveBeenCalledWith('conversation-stats', 'generate-stats', { conversationId: 'conv-1' })
  })

  it('creates stats if none exist', async () => {
    const repo = mockConversationRepo()
    const queue = mockQueueService()
    const conv = stubConversation({ status: ConversationStatus.OPEN })

    vi.mocked(repo.findById).mockResolvedValue(conv)
    vi.mocked(repo.findStats).mockResolvedValue(null)

    const uc = new CloseConversationUseCase(repo, queue)
    await uc.execute('conv-1')

    expect(repo.createStats).toHaveBeenCalledWith(expect.any(String), 'conv-1')
    expect(repo.updateStatsStatus).not.toHaveBeenCalled()
  })

  it('resets existing incomplete stats to pending', async () => {
    const repo = mockConversationRepo()
    const queue = mockQueueService()
    const conv = stubConversation({ status: ConversationStatus.OPEN })
    const stats = { id: 'stats-1', conversation_id: 'conv-1', stats_status: StatsStatus.FAILED }

    vi.mocked(repo.findById).mockResolvedValue(conv)
    vi.mocked(repo.findStats).mockResolvedValue(stats as never)

    const uc = new CloseConversationUseCase(repo, queue)
    await uc.execute('conv-1')

    expect(repo.updateStatsStatus).toHaveBeenCalledWith('stats-1', StatsStatus.PENDING)
    expect(repo.createStats).not.toHaveBeenCalled()
  })

  it('does not re-close already closed conversation', async () => {
    const repo = mockConversationRepo()
    const queue = mockQueueService()
    const conv = stubConversation({ status: ConversationStatus.CLOSED })

    vi.mocked(repo.findById).mockResolvedValue(conv)
    vi.mocked(repo.findStats).mockResolvedValue(null)

    const uc = new CloseConversationUseCase(repo, queue)
    await uc.execute('conv-1')

    expect(repo.closeConversation).not.toHaveBeenCalled()
    expect(queue.addJob).toHaveBeenCalledWith('conversation-stats', 'generate-stats', { conversationId: 'conv-1' })
  })

  it('throws NotFoundError if not found', async () => {
    const repo = mockConversationRepo()
    const queue = mockQueueService()

    vi.mocked(repo.findById).mockResolvedValue(null)

    const uc = new CloseConversationUseCase(repo, queue)

    await expect(uc.execute('missing')).rejects.toThrow(NotFoundError)
  })
})
