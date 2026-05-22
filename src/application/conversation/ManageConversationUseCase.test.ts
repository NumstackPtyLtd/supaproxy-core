import { describe, it, expect, vi } from 'vitest'
import { mockConversationRepo, stubConversation } from '../../__tests__/mocks.js'
import { ManageConversationUseCase } from './ManageConversationUseCase.js'
import { ConversationStatus } from '../../domain/conversation/ConversationStatus.js'

describe('ManageConversationUseCase', () => {
  describe('findOrCreate', () => {
    it('returns existing open conversation ID', async () => {
      const repo = mockConversationRepo()
      const conv = stubConversation({ id: 'conv-open', status: ConversationStatus.OPEN })

      vi.mocked(repo.findLatestByThread).mockResolvedValue(conv)

      const uc = new ManageConversationUseCase(repo)
      const id = await uc.findOrCreate('ws-test', 'slack', 'thread-1', 'User')

      expect(id).toBe('conv-open')
      expect(repo.reopenFromCold).not.toHaveBeenCalled()
      expect(repo.create).not.toHaveBeenCalled()
    })

    it('reopens cold conversation', async () => {
      const repo = mockConversationRepo()
      const conv = stubConversation({ id: 'conv-cold', status: ConversationStatus.COLD })

      vi.mocked(repo.findLatestByThread).mockResolvedValue(conv)

      const uc = new ManageConversationUseCase(repo)
      const id = await uc.findOrCreate('ws-test', 'slack', 'thread-1', 'User')

      expect(id).toBe('conv-cold')
      expect(repo.reopenFromCold).toHaveBeenCalledWith('conv-cold')
      expect(repo.create).not.toHaveBeenCalled()
    })

    it('creates follow-up for closed conversation with parentId', async () => {
      const repo = mockConversationRepo()
      const conv = stubConversation({ id: 'conv-closed', status: ConversationStatus.CLOSED })

      vi.mocked(repo.findLatestByThread).mockResolvedValue(conv)

      const uc = new ManageConversationUseCase(repo)
      const id = await uc.findOrCreate('ws-test', 'slack', 'thread-1', 'User', '#general')

      expect(id).not.toBe('conv-closed')
      expect(id).toEqual(expect.any(String))
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws-test',
          consumerType: 'slack',
          externalThreadId: 'thread-1',
          userName: 'User',
          channel: '#general',
          parentId: 'conv-closed',
        }),
      )
    })

    it('creates new conversation if none exists', async () => {
      const repo = mockConversationRepo()

      vi.mocked(repo.findLatestByThread).mockResolvedValue(null)

      const uc = new ManageConversationUseCase(repo)
      const id = await uc.findOrCreate('ws-test', 'api', 'thread-new', 'User')

      expect(id).toEqual(expect.any(String))
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws-test',
          consumerType: 'api',
          externalThreadId: 'thread-new',
          userName: 'User',
        }),
      )
      // No parentId when creating from scratch
      expect(repo.create).toHaveBeenCalledWith(
        expect.not.objectContaining({ parentId: expect.anything() }),
      )
    })
  })

  describe('recordMessage', () => {
    it('gets next seq, records message, and increments count', async () => {
      const repo = mockConversationRepo()

      vi.mocked(repo.getNextSeq).mockResolvedValue(3)

      const uc = new ManageConversationUseCase(repo)
      await uc.recordMessage('conv-1', 'user', 'hello', 'audit-1')

      expect(repo.getNextSeq).toHaveBeenCalledWith('conv-1')
      expect(repo.recordMessage).toHaveBeenCalledWith(expect.any(String), 'conv-1', 'user', 'hello', 3, 'audit-1')
      expect(repo.incrementMessageCount).toHaveBeenCalledWith('conv-1')
    })
  })

  describe('getHistory', () => {
    it('delegates to repo', async () => {
      const repo = mockConversationRepo()
      const messages = [{ role: 'user' as const, content: 'hi' }]

      vi.mocked(repo.findMessages).mockResolvedValue(messages)

      const uc = new ManageConversationUseCase(repo)
      const result = await uc.getHistory('conv-1')

      expect(repo.findMessages).toHaveBeenCalledWith('conv-1')
      expect(result).toEqual(messages)
    })
  })
})
