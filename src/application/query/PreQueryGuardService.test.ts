import { describe, it, expect, vi } from 'vitest'
import { PreQueryGuardService } from './PreQueryGuardService.js'

function mockDeps() {
  return {
    getMonthlySpend: vi.fn().mockResolvedValue(0),
    getWorkspaceGuardrailConfig: vi.fn().mockResolvedValue(null),
    getRecentQueryCount: vi.fn().mockResolvedValue(0),
  }
}

describe('PreQueryGuardService', () => {
  describe('cost caps', () => {
    it('passes when no cost cap configured', async () => {
      const deps = mockDeps()
      deps.getWorkspaceGuardrailConfig.mockResolvedValue(null)
      const svc = new PreQueryGuardService(deps)

      const result = await svc.check('ws-1', 'user-1')
      expect(result.allowed).toBe(true)
    })

    it('passes when spend is under the cap', async () => {
      const deps = mockDeps()
      deps.getWorkspaceGuardrailConfig.mockResolvedValue({ cost_cap_monthly_usd: 100 })
      deps.getMonthlySpend.mockResolvedValue(50)
      const svc = new PreQueryGuardService(deps)

      const result = await svc.check('ws-1', 'user-1')
      expect(result.allowed).toBe(true)
    })

    it('blocks when spend exceeds the cap', async () => {
      const deps = mockDeps()
      deps.getWorkspaceGuardrailConfig.mockResolvedValue({ cost_cap_monthly_usd: 100 })
      deps.getMonthlySpend.mockResolvedValue(105)
      const svc = new PreQueryGuardService(deps)

      const result = await svc.check('ws-1', 'user-1')
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('cost')
      expect(result.code).toBe('COST_CAP_EXCEEDED')
    })

    it('blocks when spend equals the cap exactly', async () => {
      const deps = mockDeps()
      deps.getWorkspaceGuardrailConfig.mockResolvedValue({ cost_cap_monthly_usd: 100 })
      deps.getMonthlySpend.mockResolvedValue(100)
      const svc = new PreQueryGuardService(deps)

      const result = await svc.check('ws-1', 'user-1')
      expect(result.allowed).toBe(false)
    })
  })

  describe('rate limits', () => {
    it('passes when no rate limit configured', async () => {
      const deps = mockDeps()
      deps.getWorkspaceGuardrailConfig.mockResolvedValue(null)
      const svc = new PreQueryGuardService(deps)

      const result = await svc.check('ws-1', 'user-1')
      expect(result.allowed).toBe(true)
    })

    it('passes when under the per-user-per-minute limit', async () => {
      const deps = mockDeps()
      deps.getWorkspaceGuardrailConfig.mockResolvedValue({ rate_limit: { per_user_per_minute: 10 } })
      deps.getRecentQueryCount.mockResolvedValue(5)
      const svc = new PreQueryGuardService(deps)

      const result = await svc.check('ws-1', 'user-1')
      expect(result.allowed).toBe(true)
    })

    it('blocks when per-user-per-minute limit exceeded', async () => {
      const deps = mockDeps()
      deps.getWorkspaceGuardrailConfig.mockResolvedValue({ rate_limit: { per_user_per_minute: 10 } })
      deps.getRecentQueryCount.mockResolvedValue(10)
      const svc = new PreQueryGuardService(deps)

      const result = await svc.check('ws-1', 'user-1')
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('Rate')
      expect(result.code).toBe('RATE_LIMIT_EXCEEDED')
    })

    it('checks per-workspace-per-hour limit', async () => {
      const deps = mockDeps()
      deps.getWorkspaceGuardrailConfig.mockResolvedValue({ rate_limit: { per_workspace_per_hour: 100 } })
      // No per_user_per_minute, so only workspace check runs
      deps.getRecentQueryCount.mockResolvedValue(100)
      const svc = new PreQueryGuardService(deps)

      const result = await svc.check('ws-1', 'user-1')
      expect(result.allowed).toBe(false)
      expect(result.code).toBe('RATE_LIMIT_EXCEEDED')
    })

    it('skips user rate check when no userId', async () => {
      const deps = mockDeps()
      deps.getWorkspaceGuardrailConfig.mockResolvedValue({ rate_limit: { per_user_per_minute: 10, per_workspace_per_hour: 500 } })
      deps.getRecentQueryCount.mockResolvedValue(0)
      const svc = new PreQueryGuardService(deps)

      const result = await svc.check('ws-1', undefined)
      expect(result.allowed).toBe(true)
      // Only workspace-level check, not user-level
      expect(deps.getRecentQueryCount).toHaveBeenCalledTimes(1)
    })
  })

  describe('blocked topics', () => {
    it('passes when no blocked topics configured', async () => {
      const deps = mockDeps()
      deps.getWorkspaceGuardrailConfig.mockResolvedValue(null)
      const svc = new PreQueryGuardService(deps)

      const result = await svc.checkQuery('ws-1', 'user-1', 'Tell me about our products')
      expect(result.allowed).toBe(true)
    })

    it('passes when query does not mention blocked topics', async () => {
      const deps = mockDeps()
      deps.getWorkspaceGuardrailConfig.mockResolvedValue({ blocked_topics: ['competitor pricing', 'internal salaries'] })
      const svc = new PreQueryGuardService(deps)

      const result = await svc.checkQuery('ws-1', 'user-1', 'What is our refund policy?')
      expect(result.allowed).toBe(true)
    })

    it('blocks when query mentions a blocked topic', async () => {
      const deps = mockDeps()
      deps.getWorkspaceGuardrailConfig.mockResolvedValue({ blocked_topics: ['competitor pricing', 'internal salaries'] })
      const svc = new PreQueryGuardService(deps)

      const result = await svc.checkQuery('ws-1', 'user-1', 'What are the competitor pricing rates?')
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('blocked topic')
      expect(result.code).toBe('BLOCKED_TOPIC')
    })

    it('matching is case-insensitive', async () => {
      const deps = mockDeps()
      deps.getWorkspaceGuardrailConfig.mockResolvedValue({ blocked_topics: ['Internal Salaries'] })
      const svc = new PreQueryGuardService(deps)

      const result = await svc.checkQuery('ws-1', 'user-1', 'Tell me about internal salaries at the company')
      expect(result.allowed).toBe(false)
      expect(result.code).toBe('BLOCKED_TOPIC')
    })

    it('runs cost cap and rate limit checks together with topic check', async () => {
      const deps = mockDeps()
      deps.getWorkspaceGuardrailConfig.mockResolvedValue({ cost_cap_monthly_usd: 100, blocked_topics: ['salaries'] })
      deps.getMonthlySpend.mockResolvedValue(200)
      const svc = new PreQueryGuardService(deps)

      // Cost cap should fail first before even checking topics
      const result = await svc.checkQuery('ws-1', 'user-1', 'Tell me about salaries')
      expect(result.allowed).toBe(false)
      expect(result.code).toBe('COST_CAP_EXCEEDED')
    })
  })
})
