import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { RoutingSession } from '../../application/ports/SessionStore.js'

const mockGet = vi.fn()
const mockSet = vi.fn()
const mockDel = vi.fn()

vi.mock('ioredis', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      get: mockGet,
      set: mockSet,
      del: mockDel,
    })),
  }
})

vi.mock('pino', () => ({
  default: () => ({
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  }),
}))

import { RedisSessionStore } from './RedisSessionStore.js'

const sampleSession: RoutingSession = {
  workspaceId: 'ws-1',
  lastMessageAt: 1700000000000,
  routedFrom: null,
}

describe('RedisSessionStore', () => {
  let store: RedisSessionStore

  beforeEach(() => {
    store = new RedisSessionStore('localhost', 6379)
    vi.clearAllMocks()
  })

  describe('get', () => {
    it('returns parsed session when key exists', async () => {
      mockGet.mockResolvedValue(JSON.stringify(sampleSession))

      const result = await store.get('session:key')

      expect(result).toEqual(sampleSession)
      expect(mockGet).toHaveBeenCalledWith('session:key')
    })

    it('returns null when key does not exist', async () => {
      mockGet.mockResolvedValue(null)

      const result = await store.get('missing-key')

      expect(result).toBeNull()
    })

    it('returns null when stored value is invalid JSON', async () => {
      mockGet.mockResolvedValue('NOT VALID JSON{{{')

      const result = await store.get('bad-key')

      expect(result).toBeNull()
    })
  })

  describe('set', () => {
    it('stores the session with EX TTL', async () => {
      mockSet.mockResolvedValue('OK')

      await store.set('session:key', sampleSession, 3600)

      expect(mockSet).toHaveBeenCalledWith(
        'session:key',
        JSON.stringify(sampleSession),
        'EX',
        3600,
      )
    })
  })

  describe('delete', () => {
    it('deletes the key from redis', async () => {
      mockDel.mockResolvedValue(1)

      await store.delete('session:key')

      expect(mockDel).toHaveBeenCalledWith('session:key')
    })
  })
})
