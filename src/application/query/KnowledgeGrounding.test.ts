import { describe, it, expect } from 'vitest'
import { resolveGrounding, buildGroundingClause, buildReceptionistGroundingClause, normaliseGrounding, DEFAULT_KNOWLEDGE_GROUNDING } from './KnowledgeGrounding.js'

describe('normaliseGrounding', () => {
  it('accepts the three valid levels', () => {
    expect(normaliseGrounding('strict')).toBe('strict')
    expect(normaliseGrounding('grounded')).toBe('grounded')
    expect(normaliseGrounding('open')).toBe('open')
  })

  it('rejects unknown values', () => {
    expect(normaliseGrounding('loose')).toBeNull()
    expect(normaliseGrounding('')).toBeNull()
    expect(normaliseGrounding(null)).toBeNull()
    expect(normaliseGrounding(undefined)).toBeNull()
  })
})

describe('resolveGrounding', () => {
  it('uses the workspace override first', () => {
    expect(resolveGrounding('strict', 'open')).toBe('strict')
  })

  it('falls back to the org default when no workspace override', () => {
    expect(resolveGrounding(null, 'open')).toBe('open')
    expect(resolveGrounding('bad', 'open')).toBe('open')
  })

  it('falls back to the system default when neither is set', () => {
    expect(resolveGrounding(null, null)).toBe(DEFAULT_KNOWLEDGE_GROUNDING)
    expect(DEFAULT_KNOWLEDGE_GROUNDING).toBe('strict')
  })
})

describe('buildGroundingClause', () => {
  it('strict forbids general knowledge, overrides the role, and bans ungoverned facts', () => {
    const clause = buildGroundingClause('strict', 0)
    expect(clause).toContain('ONLY information from the workspace knowledge base')
    expect(clause).toContain('overrides your role')
    expect(clause).toMatch(/currency/)
  })

  it('grounded allows phrasing but forbids invented facts/figures/currency', () => {
    const clause = buildGroundingClause('grounded', 3)
    expect(clause).toContain('Every factual claim')
    expect(clause).toMatch(/never state any fact, figure, amount, currency/)
  })

  it('open with chunks is permissive', () => {
    expect(buildGroundingClause('open', 2)).toContain('inform your response where relevant')
  })

  it('open with no chunks adds nothing', () => {
    expect(buildGroundingClause('open', 0)).toBe('')
  })

  it('strict and grounded apply even when no chunks were retrieved', () => {
    expect(buildGroundingClause('strict', 0)).not.toBe('')
    expect(buildGroundingClause('grounded', 0)).not.toBe('')
  })

  it('strict and grounded forbid fabricating tool calls and results', () => {
    for (const level of ['strict', 'grounded'] as const) {
      const clause = buildGroundingClause(level, 0)
      expect(clause).toMatch(/tool result.*actual output/i)
      expect(clause).toMatch(/never invent[^.]*tool|role-play tool/i)
    }
  })
})

describe('buildReceptionistGroundingClause', () => {
  it('forbids inventing specifics under strict and grounded', () => {
    for (const level of ['strict', 'grounded'] as const) {
      const clause = buildReceptionistGroundingClause(level)
      expect(clause).toContain('never invent')
      expect(clause).toMatch(/currencies/)
    }
  })

  it('adds nothing under open', () => {
    expect(buildReceptionistGroundingClause('open')).toBe('')
  })
})
