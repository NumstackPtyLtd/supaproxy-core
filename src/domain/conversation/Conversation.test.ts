import { describe, it, expect } from 'vitest'
import { Conversation } from './Conversation.js'
import { ConversationStatus } from './ConversationStatus.js'

function makeConversation(overrides: Partial<Parameters<typeof Conversation.fromData>[0]> = {}) {
  return Conversation.fromData({
    id: 'conv-1',
    workspace_id: 'ws-test',
    consumer_type: 'api',
    external_thread_id: 'thread-1',
    status: ConversationStatus.OPEN,
    user_id: 'user-1',
    user_name: 'Test User',
    channel: null,
    message_count: 2,
    first_message_at: '2024-01-01',
    last_activity_at: '2024-01-01',
    cold_at: null,
    closed_at: null,
    routed_from: null,
    routed_to: null,
    route_reason: null,
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
    ...overrides,
  })
}

describe('Conversation', () => {
  describe('isActive', () => {
    it('returns true for open conversations', () => {
      const conv = makeConversation({ status: ConversationStatus.OPEN })
      expect(conv.isActive()).toBe(true)
    })

    it('returns true for cold conversations', () => {
      const conv = makeConversation({ status: ConversationStatus.COLD })
      expect(conv.isActive()).toBe(true)
    })

    it('returns false for closed conversations', () => {
      const conv = makeConversation({ status: ConversationStatus.CLOSED })
      expect(conv.isActive()).toBe(false)
    })
  })

  describe('isClosed', () => {
    it('returns true for closed conversations', () => {
      const conv = makeConversation({ status: ConversationStatus.CLOSED })
      expect(conv.isClosed()).toBe(true)
    })

    it('returns false for open conversations', () => {
      const conv = makeConversation({ status: ConversationStatus.OPEN })
      expect(conv.isClosed()).toBe(false)
    })
  })

  describe('canReopen', () => {
    it('returns true for cold conversations', () => {
      const conv = makeConversation({ status: ConversationStatus.COLD })
      expect(conv.canReopen()).toBe(true)
    })

    it('returns false for open conversations', () => {
      const conv = makeConversation({ status: ConversationStatus.OPEN })
      expect(conv.canReopen()).toBe(false)
    })

    it('returns false for closed conversations', () => {
      const conv = makeConversation({ status: ConversationStatus.CLOSED })
      expect(conv.canReopen()).toBe(false)
    })
  })

  describe('reopenFromCold', () => {
    it('transitions cold to open', () => {
      const conv = makeConversation({ status: ConversationStatus.COLD })
      conv.reopenFromCold()
      expect(conv.status).toBe(ConversationStatus.OPEN)
    })

    it('throws when not cold', () => {
      const conv = makeConversation({ status: ConversationStatus.OPEN })
      expect(() => conv.reopenFromCold()).toThrow('Cannot transition from open to open')
    })

    it('throws when closed', () => {
      const conv = makeConversation({ status: ConversationStatus.CLOSED })
      expect(() => conv.reopenFromCold()).toThrow('Cannot transition from closed to open')
    })
  })

  describe('transitionToCold', () => {
    it('transitions open to cold', () => {
      const conv = makeConversation({ status: ConversationStatus.OPEN })
      conv.transitionToCold()
      expect(conv.status).toBe(ConversationStatus.COLD)
    })

    it('throws when already cold', () => {
      const conv = makeConversation({ status: ConversationStatus.COLD })
      expect(() => conv.transitionToCold()).toThrow('Cannot transition from cold to cold')
    })

    it('throws when closed', () => {
      const conv = makeConversation({ status: ConversationStatus.CLOSED })
      expect(() => conv.transitionToCold()).toThrow('Cannot transition from closed to cold')
    })
  })

  describe('close', () => {
    it('closes an open conversation', () => {
      const conv = makeConversation({ status: ConversationStatus.OPEN })
      conv.close()
      expect(conv.status).toBe(ConversationStatus.CLOSED)
    })

    it('closes a cold conversation', () => {
      const conv = makeConversation({ status: ConversationStatus.COLD })
      conv.close()
      expect(conv.status).toBe(ConversationStatus.CLOSED)
    })

    it('is idempotent for already closed conversations', () => {
      const conv = makeConversation({ status: ConversationStatus.CLOSED })
      conv.close()
      expect(conv.status).toBe(ConversationStatus.CLOSED)
    })
  })

  describe('properties', () => {
    it('exposes id and workspaceId', () => {
      const conv = makeConversation({ id: 'conv-42', workspace_id: 'ws-99' })
      expect(conv.id).toBe('conv-42')
      expect(conv.workspaceId).toBe('ws-99')
    })
  })
})
