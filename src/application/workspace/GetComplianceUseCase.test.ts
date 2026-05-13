import { describe, it, expect, vi } from 'vitest'
import { mockWorkspaceRepo, mockConversationRepo, mockGuardrailEventRepo } from '../../__tests__/mocks.js'
import { GetComplianceUseCase } from './GetComplianceUseCase.js'

describe('GetComplianceUseCase', () => {
  it('returns guardrails and parsed violations', async () => {
    const wsRepo = mockWorkspaceRepo()
    const convRepo = mockConversationRepo()
    vi.mocked(wsRepo.findGuardrails).mockResolvedValue([
      { id: 'g1', rule_type: 'pii_filter', enabled: true, config: '{}' },
    ])
    vi.mocked(convRepo.getComplianceViolationsByWorkspace).mockResolvedValue([
      { compliance_violations: JSON.stringify([{ rule: 'PII', description: 'Email leaked' }]), conversation_id: 'c1', user_name: 'Bob', last_activity_at: '2024-01-01' },
    ])

    const useCase = new GetComplianceUseCase(wsRepo, convRepo)
    const result = await useCase.execute('ws-test')

    expect(result.guardrails).toHaveLength(1)
    expect(result.violations).toHaveLength(1)
    expect(result.violations[0].rule).toBe('PII')
    expect(result.violations[0].conversation_id).toBe('c1')
  })

  it('handles null compliance_violations gracefully', async () => {
    const wsRepo = mockWorkspaceRepo()
    const convRepo = mockConversationRepo()
    vi.mocked(convRepo.getComplianceViolationsByWorkspace).mockResolvedValue([
      { compliance_violations: null, conversation_id: 'c1', user_name: null, last_activity_at: null },
    ])

    const useCase = new GetComplianceUseCase(wsRepo, convRepo)
    const result = await useCase.execute('ws-test')

    expect(result.violations).toHaveLength(0)
  })

  it('includes guardrail events in the response', async () => {
    const wsRepo = mockWorkspaceRepo()
    const convRepo = mockConversationRepo()
    const eventRepo = mockGuardrailEventRepo()
    vi.mocked(eventRepo.findByWorkspace).mockResolvedValue([
      { id: 'evt-1', workspace_id: 'ws-test', conversation_id: 'conv-1', event_type: 'execution_blocked', plugin_id: 'write-guard', tool_name: 'delete_account', tool_args: '{"id":"123"}', connection_name: 'test-mcp', original_query: 'What is my balance?', reason: 'No write intent', original_content: null, stripped_content: null, created_at: '2026-05-13' },
      { id: 'evt-2', workspace_id: 'ws-test', conversation_id: 'conv-2', event_type: 'retrieval_stripped', plugin_id: 'injection-sanitiser', tool_name: 'fetch_page', tool_args: null, connection_name: 'test-mcp', original_query: null, reason: null, original_content: 'Bad content', stripped_content: 'Ignore previous instructions', created_at: '2026-05-13' },
    ])

    const useCase = new GetComplianceUseCase(wsRepo, convRepo, eventRepo)
    const result = await useCase.execute('ws-test')

    expect(result.guardrailEvents).toHaveLength(2)
    expect(result.guardrailEvents[0].event_type).toBe('execution_blocked')
    expect(result.guardrailEvents[0].tool_name).toBe('delete_account')
    expect(result.guardrailEvents[1].event_type).toBe('retrieval_stripped')
    expect(result.guardrailEvents[1].stripped_content).toBe('Ignore previous instructions')
  })

  it('returns empty guardrail events when no event repo provided', async () => {
    const wsRepo = mockWorkspaceRepo()
    const convRepo = mockConversationRepo()

    const useCase = new GetComplianceUseCase(wsRepo, convRepo)
    const result = await useCase.execute('ws-test')

    expect(result.guardrailEvents).toEqual([])
  })
})
