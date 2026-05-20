import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock ioredis before importing the class under test
const mockIncr = vi.fn()
const mockExpire = vi.fn()
const mockConnect = vi.fn().mockResolvedValue(undefined)

vi.mock('ioredis', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      incr: mockIncr,
      expire: mockExpire,
      connect: mockConnect,
    })),
  }
})

// Mock pino to silence logs
vi.mock('pino', () => ({
  default: () => ({
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  }),
}))

import { PreQueryGuardDepsImpl } from './PreQueryGuardDepsImpl.js'

function mockPool() {
  return {
    execute: vi.fn(),
  } as any
}

describe('PreQueryGuardDepsImpl', () => {
  let pool: ReturnType<typeof mockPool>

  beforeEach(() => {
    pool = mockPool()
    vi.clearAllMocks()
  })

  describe('getMonthlySpend', () => {
    it('returns the total from the query result', async () => {
      pool.execute.mockResolvedValue([[{ total: 42.5 }]])
      const deps = new PreQueryGuardDepsImpl(pool)

      const result = await deps.getMonthlySpend('ws-1')

      expect(result).toBe(42.5)
      expect(pool.execute).toHaveBeenCalledWith(
        expect.stringContaining('SUM(cost_usd)'),
        ['ws-1'],
      )
    })

    it('returns 0 when total is null', async () => {
      pool.execute.mockResolvedValue([[{ total: null }]])
      const deps = new PreQueryGuardDepsImpl(pool)

      const result = await deps.getMonthlySpend('ws-1')

      expect(result).toBe(0)
    })

    it('returns 0 when rows are empty', async () => {
      pool.execute.mockResolvedValue([[]])
      const deps = new PreQueryGuardDepsImpl(pool)

      const result = await deps.getMonthlySpend('ws-1')

      expect(result).toBe(0)
    })
  })

  describe('getWorkspaceGuardrailConfig', () => {
    it('returns null when no guardrail rows exist', async () => {
      pool.execute.mockResolvedValue([[]])
      const deps = new PreQueryGuardDepsImpl(pool)

      const result = await deps.getWorkspaceGuardrailConfig('ws-1')

      expect(result).toBeNull()
    })

    it('merges cost_cap from a single config row', async () => {
      pool.execute.mockResolvedValue([[
        { config: JSON.stringify({ cost_cap_monthly_usd: 100 }) },
      ]])
      const deps = new PreQueryGuardDepsImpl(pool)

      const result = await deps.getWorkspaceGuardrailConfig('ws-1')

      expect(result).toEqual({ cost_cap_monthly_usd: 100 })
    })

    it('merges multiple config rows', async () => {
      pool.execute.mockResolvedValue([[
        { config: JSON.stringify({ cost_cap_monthly_usd: 200 }) },
        { config: JSON.stringify({ rate_limit: { per_user_per_minute: 10 } }) },
        { config: JSON.stringify({ blocked_topics: ['pii'] }) },
      ]])
      const deps = new PreQueryGuardDepsImpl(pool)

      const result = await deps.getWorkspaceGuardrailConfig('ws-1')

      expect(result).toEqual({
        cost_cap_monthly_usd: 200,
        rate_limit: { per_user_per_minute: 10 },
        blocked_topics: ['pii'],
      })
    })

    it('concatenates blocked_topics from multiple rows', async () => {
      pool.execute.mockResolvedValue([[
        { config: JSON.stringify({ blocked_topics: ['pii'] }) },
        { config: JSON.stringify({ blocked_topics: ['violence', 'hate'] }) },
      ]])
      const deps = new PreQueryGuardDepsImpl(pool)

      const result = await deps.getWorkspaceGuardrailConfig('ws-1')

      expect(result?.blocked_topics).toEqual(['pii', 'violence', 'hate'])
    })

    it('skips rows with null config', async () => {
      pool.execute.mockResolvedValue([[
        { config: null },
        { config: JSON.stringify({ cost_cap_monthly_usd: 50 }) },
      ]])
      const deps = new PreQueryGuardDepsImpl(pool)

      const result = await deps.getWorkspaceGuardrailConfig('ws-1')

      expect(result).toEqual({ cost_cap_monthly_usd: 50 })
    })

    it('skips rows with invalid JSON and merges the rest', async () => {
      pool.execute.mockResolvedValue([[
        { config: 'NOT VALID JSON' },
        { config: JSON.stringify({ cost_cap_monthly_usd: 75 }) },
      ]])
      const deps = new PreQueryGuardDepsImpl(pool)

      const result = await deps.getWorkspaceGuardrailConfig('ws-1')

      expect(result).toEqual({ cost_cap_monthly_usd: 75 })
    })

    it('returns null when all configs are invalid', async () => {
      pool.execute.mockResolvedValue([[
        { config: 'BAD JSON' },
      ]])
      const deps = new PreQueryGuardDepsImpl(pool)

      const result = await deps.getWorkspaceGuardrailConfig('ws-1')

      expect(result).toBeNull()
    })
  })

  describe('getRecentQueryCount', () => {
    it('returns 0 when redis is not configured', async () => {
      const deps = new PreQueryGuardDepsImpl(pool)

      const result = await deps.getRecentQueryCount('ws:ws-1:user:u-1', 60)

      expect(result).toBe(0)
    })

    it('increments the key and returns count minus 1', async () => {
      mockIncr.mockResolvedValue(5)
      const deps = new PreQueryGuardDepsImpl(pool, 'localhost', 6379)

      const result = await deps.getRecentQueryCount('ws:ws-1:user:u-1', 60)

      expect(result).toBe(4)
      expect(mockIncr).toHaveBeenCalledWith('ratelimit:ws:ws-1:user:u-1')
    })

    it('sets expiry when count is 1 (new key)', async () => {
      mockIncr.mockResolvedValue(1)
      mockExpire.mockResolvedValue(1)
      const deps = new PreQueryGuardDepsImpl(pool, 'localhost', 6379)

      const result = await deps.getRecentQueryCount('scope', 120)

      expect(result).toBe(0)
      expect(mockExpire).toHaveBeenCalledWith('ratelimit:scope', 120)
    })

    it('does not set expiry when count is greater than 1', async () => {
      mockIncr.mockResolvedValue(3)
      const deps = new PreQueryGuardDepsImpl(pool, 'localhost', 6379)

      await deps.getRecentQueryCount('scope', 60)

      expect(mockExpire).not.toHaveBeenCalled()
    })

    it('returns 0 when redis throws an error', async () => {
      mockIncr.mockRejectedValue(new Error('connection refused'))
      const deps = new PreQueryGuardDepsImpl(pool, 'localhost', 6379)

      const result = await deps.getRecentQueryCount('scope', 60)

      expect(result).toBe(0)
    })
  })
})
