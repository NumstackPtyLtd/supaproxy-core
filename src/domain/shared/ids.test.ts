import { describe, it, expect } from 'vitest'
import { workspaceId, conversationId, organisationId, userId, auditLogId, teamId } from './ids.js'

describe('Branded ID types', () => {
  it('workspaceId wraps a string', () => {
    const id = workspaceId('ws-123')
    expect(id).toBe('ws-123')
    expect(typeof id).toBe('string')
  })

  it('conversationId wraps a string', () => {
    const id = conversationId('conv-456')
    expect(id).toBe('conv-456')
  })

  it('organisationId wraps a string', () => {
    const id = organisationId('org-789')
    expect(id).toBe('org-789')
  })

  it('userId wraps a string', () => {
    const id = userId('user-abc')
    expect(id).toBe('user-abc')
  })

  it('auditLogId wraps a string', () => {
    const id = auditLogId('audit-def')
    expect(id).toBe('audit-def')
  })

  it('teamId wraps a string', () => {
    const id = teamId('team-ghi')
    expect(id).toBe('team-ghi')
  })

  it('branded IDs are usable as plain strings at runtime', () => {
    const ws = workspaceId('ws-test')
    const str: string = ws
    expect(str.startsWith('ws-')).toBe(true)
  })
})
