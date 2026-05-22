import { describe, it, expect, vi } from 'vitest'
import { mockConversationQueryRepo } from '../../__tests__/mocks.js'
import { ListConversationsUseCase } from './ListConversationsUseCase.js'

describe('ListConversationsUseCase', () => {
  it('returns conversations with total and filters', async () => {
    const repo = mockConversationQueryRepo()
    const rows = [{ id: 'conv-1' }, { id: 'conv-2' }]
    const filterValues = { status: ['open', 'closed'], consumer: ['slack'], category: ['billing'], resolution: ['resolved'] }

    vi.mocked(repo.listWithStats).mockResolvedValue({ rows: rows as never[], total: 42 })
    vi.mocked(repo.getFilters).mockResolvedValue(filterValues)

    const uc = new ListConversationsUseCase(repo)
    const result = await uc.execute('ws-test', { status: 'open' }, 20, 0)

    expect(repo.listWithStats).toHaveBeenCalledWith('ws-test', { status: 'open' }, 20, 0)
    expect(repo.getFilters).toHaveBeenCalledWith('ws-test')
    expect(result).toEqual({ conversations: rows, total: 42, filters: filterValues })
  })
})
