import { describe, it, expect } from 'vitest'
import { IntegrationStatus } from './IntegrationStatus.js'

describe('IntegrationStatus', () => {
  it('ACTIVE matches the DB string literal', () => {
    expect(IntegrationStatus.ACTIVE).toBe('active')
  })

  it('INACTIVE matches the DB string literal', () => {
    expect(IntegrationStatus.INACTIVE).toBe('inactive')
  })

  it('has exactly two members', () => {
    const values = Object.values(IntegrationStatus)
    expect(values).toHaveLength(2)
    expect(values).toEqual(['active', 'inactive'])
  })
})
