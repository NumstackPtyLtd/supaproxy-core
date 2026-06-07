import { describe, it, expect } from 'vitest'
import { parseKnowledgeGaps, normaliseKnowledgeGap } from './jsonMappers.js'

describe('normaliseKnowledgeGap', () => {
  it('keeps a full structured gap intact', () => {
    const gap = normaliseKnowledgeGap({
      topic: 'Loan rates',
      missing_information: 'The APR for personal loans',
      sources_checked: ['Lending policy', 'calculate_loan'],
      gap_detail: 'No APR figures are documented anywhere in the knowledge base.',
    })
    expect(gap.topic).toBe('Loan rates')
    expect(gap.missing_information).toBe('The APR for personal loans')
    expect(gap.sources_checked).toEqual(['Lending policy', 'calculate_loan'])
    expect(gap.gap_detail).toContain('No APR figures')
  })

  it('maps the legacy description field into missing_information', () => {
    const gap = normaliseKnowledgeGap({ topic: 'billing', description: 'No billing info' })
    expect(gap.topic).toBe('billing')
    expect(gap.missing_information).toBe('No billing info')
    expect(gap.sources_checked).toEqual([])
    expect(gap.gap_detail).toBe('')
  })

  it('fills defaults for a sparse or malformed gap', () => {
    const gap = normaliseKnowledgeGap({ sources_checked: ['x', 42] })
    expect(gap.topic).toBe('Unspecified topic')
    expect(gap.missing_information).toBe('')
    expect(gap.sources_checked).toEqual(['x'])
  })
})

describe('parseKnowledgeGaps', () => {
  it('parses and normalises a JSON array of gaps', () => {
    const raw = JSON.stringify([{ topic: 'a', missing_information: 'b', sources_checked: ['s'], gap_detail: 'd' }])
    const gaps = parseKnowledgeGaps(raw)
    expect(gaps).toHaveLength(1)
    expect(gaps[0]).toEqual({ topic: 'a', missing_information: 'b', sources_checked: ['s'], gap_detail: 'd' })
  })

  it('returns an empty array for null or invalid input', () => {
    expect(parseKnowledgeGaps(null)).toEqual([])
    expect(parseKnowledgeGaps('not json')).toEqual([])
  })
})
