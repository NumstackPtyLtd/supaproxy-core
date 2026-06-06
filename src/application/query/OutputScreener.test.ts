import { describe, it, expect } from 'vitest'
import type { GuardrailPlugin, GuardrailInput, GuardrailOutput } from '@supaproxy/guardrails'
import { screenOutput } from './OutputScreener.js'

function fakeGuard(id: string, fn: (input: GuardrailInput) => GuardrailOutput): GuardrailPlugin {
  return {
    id, name: id, description: 'test', version: '1.0.0', author: 'test',
    stage: 'post-llm', configSchema: { fields: [] },
    process: async (input) => fn(input),
  }
}

const ctx = { workspaceId: 'ws-1', consumerType: 'api' }

describe('screenOutput', () => {
  it('is a no-op when there are no post-llm guardrails', async () => {
    const out = await screenOutput([], 'The limit is 25,000 units.', ctx, { grounding: 'strict' })
    expect(out.blocked).toBe(false)
    expect(out.answer).toBe('The limit is 25,000 units.')
  })

  it('blocks and replaces the answer when a guard blocks, exposing the reason', async () => {
    const guard = fakeGuard('grounding-guard', () => ({ action: 'block', reason: 'Ungrounded: £', annotations: ['ungrounded:currency:£'] }))
    const out = await screenOutput([guard], 'The limit is £25,000.', ctx, { grounding: 'strict', knowledgeContext: '25,000 units' })
    expect(out.blocked).toBe(true)
    expect(out.answer).toBe('Ungrounded: £')
    expect(out.annotations).toContain('ungrounded:currency:£')
  })

  it('passes the answer through and surfaces annotations when a guard only flags', async () => {
    const guard = fakeGuard('grounding-guard', () => ({ action: 'continue', annotations: ['ungrounded:currency:£'] }))
    const out = await screenOutput([guard], 'The limit is £25,000.', ctx, { grounding: 'grounded' })
    expect(out.blocked).toBe(false)
    expect(out.answer).toBe('The limit is £25,000.')
    expect(out.annotations).toContain('ungrounded:currency:£')
  })

  it('forwards the grounding level and knowledge context to the guard', async () => {
    let seen: Record<string, unknown> = {}
    const guard = fakeGuard('grounding-guard', (input) => { seen = input.metadata; return { action: 'continue' } })
    await screenOutput([guard], 'answer', ctx, { grounding: 'strict', knowledgeContext: 'the context' })
    expect(seen.grounding).toBe('strict')
    expect(seen.knowledgeContext).toBe('the context')
  })
})
