import { describe, it, expect, vi } from 'vitest'

// Mock config to avoid env var requirements
vi.mock('../config.js', () => ({
  LOG_DIR: '/tmp/test-logs',
}))

const { logAuditEntry } = await import('./audit.js')

describe('logAuditEntry', () => {
  it('is exported as a function', () => {
    expect(typeof logAuditEntry).toBe('function')
  })
})
