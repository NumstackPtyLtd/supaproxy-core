import { describe, it, expect } from 'vitest'
import { StatsStatus } from './StatsStatus.js'

describe('StatsStatus', () => {
  it('PENDING matches the DB string literal', () => {
    expect(StatsStatus.PENDING).toBe('pending')
  })

  it('COMPLETE matches the DB string literal', () => {
    expect(StatsStatus.COMPLETE).toBe('complete')
  })

  it('FAILED matches the DB string literal', () => {
    expect(StatsStatus.FAILED).toBe('failed')
  })

  it('has exactly three members', () => {
    const values = Object.values(StatsStatus)
    expect(values).toHaveLength(3)
    expect(values).toEqual(['pending', 'complete', 'failed'])
  })
})
