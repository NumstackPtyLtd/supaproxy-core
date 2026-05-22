import { describe, it, expect } from 'vitest'
import { ConversationStatus } from './ConversationStatus.js'

describe('ConversationStatus', () => {
  it('OPEN matches the DB string literal', () => {
    expect(ConversationStatus.OPEN).toBe('open')
  })

  it('COLD matches the DB string literal', () => {
    expect(ConversationStatus.COLD).toBe('cold')
  })

  it('CLOSED matches the DB string literal', () => {
    expect(ConversationStatus.CLOSED).toBe('closed')
  })

  it('has exactly three members', () => {
    const values = Object.values(ConversationStatus)
    expect(values).toHaveLength(3)
    expect(values).toEqual(['open', 'cold', 'closed'])
  })
})
