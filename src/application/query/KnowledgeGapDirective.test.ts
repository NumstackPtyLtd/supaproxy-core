import { describe, it, expect } from 'vitest'
import { extractKnowledgeGap } from './KnowledgeGapDirective.js'

describe('extractKnowledgeGap', () => {
  it('returns no gap and the original answer when there is no directive', () => {
    const answer = 'The minimum loan amount is 1,000 units.'
    const out = extractKnowledgeGap(answer)
    expect(out.gap).toBeNull()
    expect(out.cleanedAnswer).toBe(answer)
  })

  it('extracts a structured gap and strips the directive from the answer', () => {
    const answer = 'I do not have the interest rate in the knowledge base.\n' +
      '<!-- KNOWLEDGE_GAP: {"topic":"Loan interest rates","missing_information":"The APR for personal loans","sources_checked":["Lending policy","calculate_loan"],"gap_detail":"No APR figures are documented."} -->'
    const out = extractKnowledgeGap(answer)
    expect(out.cleanedAnswer).toBe('I do not have the interest rate in the knowledge base.')
    expect(out.cleanedAnswer).not.toContain('KNOWLEDGE_GAP')
    expect(out.gap).toEqual({
      topic: 'Loan interest rates',
      missing_information: 'The APR for personal loans',
      sources_checked: ['Lending policy', 'calculate_loan'],
      gap_detail: 'No APR figures are documented.',
    })
  })

  it('normalises a sparse directive payload with defaults', () => {
    const answer = 'Not covered.\n<!-- KNOWLEDGE_GAP: {"topic":"Refunds"} -->'
    const out = extractKnowledgeGap(answer)
    expect(out.gap?.topic).toBe('Refunds')
    expect(out.gap?.missing_information).toBe('')
    expect(out.gap?.sources_checked).toEqual([])
  })

  it('returns no gap but still strips the directive when the JSON is malformed', () => {
    const answer = 'Sorry.\n<!-- KNOWLEDGE_GAP: {not valid json} -->'
    const out = extractKnowledgeGap(answer)
    expect(out.gap).toBeNull()
    expect(out.cleanedAnswer).toBe('Sorry.')
  })
})
