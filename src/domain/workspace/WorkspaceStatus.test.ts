import { describe, it, expect } from 'vitest'
import { WorkspaceStatus } from './WorkspaceStatus.js'

describe('WorkspaceStatus', () => {
  it('ACTIVE matches the DB string literal', () => {
    expect(WorkspaceStatus.ACTIVE).toBe('active')
  })

  it('PAUSED matches the DB string literal', () => {
    expect(WorkspaceStatus.PAUSED).toBe('paused')
  })

  it('ARCHIVED matches the DB string literal', () => {
    expect(WorkspaceStatus.ARCHIVED).toBe('archived')
  })

  it('has exactly three members', () => {
    const values = Object.values(WorkspaceStatus)
    expect(values).toHaveLength(3)
    expect(values).toEqual(['active', 'paused', 'archived'])
  })
})
