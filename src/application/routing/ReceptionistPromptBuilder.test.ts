import { describe, it, expect } from 'vitest'
import { ReceptionistPromptBuilder } from './ReceptionistPromptBuilder.js'

describe('ReceptionistPromptBuilder', () => {
  const builder = new ReceptionistPromptBuilder()

  it('builds prompt with org name and workspace summaries', () => {
    const prompt = builder.build('Acme Corp', [
      { id: 'ws-insurance', name: 'Insurance', system_prompt: 'Handles claims and policies.', tool_names: ['create_claim', 'check_status'] },
      { id: 'ws-banking', name: 'Banking', system_prompt: 'Account management.', tool_names: ['get_balance'] },
    ])

    expect(prompt).toContain('receptionist for Acme Corp')
    expect(prompt).toContain('Insurance')
    expect(prompt).toContain('create_claim, check_status')
    expect(prompt).toContain('Banking')
    expect(prompt).toContain('get_balance')
    expect(prompt).toContain('ws-insurance')
    expect(prompt).toContain('ws-banking')
    expect(prompt).toContain('<!-- ROUTE:workspace_id:reason -->')
  })

  it('handles workspaces with no tools', () => {
    const prompt = builder.build('Test Org', [
      { id: 'ws-support', name: 'Support', system_prompt: 'General help.', tool_names: [] },
    ])

    expect(prompt).toContain('Support')
    expect(prompt).not.toContain('Tools:')
  })

  it('handles workspaces with no system prompt', () => {
    const prompt = builder.build('Test Org', [
      { id: 'ws-hr', name: 'HR', system_prompt: null, tool_names: ['submit_leave'] },
    ])

    expect(prompt).toContain('- HR: Tools: submit_leave.')
  })
})
