import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockOrgRepo, mockWorkspaceRepo, stubWorkspace } from '../../__tests__/mocks.js'
import { RouteMessageUseCase } from './RouteMessageUseCase.js'
import type { SessionStore } from '../ports/SessionStore.js'
import type { ExecuteQueryUseCase } from '../query/ExecuteQueryUseCase.js'
import type { registry as ProviderRegistryType } from '@supaproxy/providers'

function mockSessionStore(): SessionStore {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  }
}

function mockExecuteQuery(): ExecuteQueryUseCase {
  return {
    execute: vi.fn().mockResolvedValue({
      answer: 'Hello',
      conversationId: 'conv-1',
      sessionId: 'session-1',
      toolsCalled: [],
      connectionsHit: [],
      tokensInput: 10,
      tokensOutput: 20,
      costUsd: 0.001,
      durationMs: 100,
      error: null,
    }),
  } as unknown as ExecuteQueryUseCase
}

const baseInput = {
  orgId: 'org-1',
  query: 'My car was in an accident',
  consumerType: 'whatsapp',
  entryPoint: '+27813983478',
  userId: 'user-wa-1',
  userName: 'Test User',
}

describe('RouteMessageUseCase', () => {
  let orgRepo: ReturnType<typeof mockOrgRepo>
  let workspaceRepo: ReturnType<typeof mockWorkspaceRepo>
  let sessionStore: ReturnType<typeof mockSessionStore>
  let executeQuery: ReturnType<typeof mockExecuteQuery>
  let providerRegistry: typeof ProviderRegistryType
  let useCase: RouteMessageUseCase

  beforeEach(() => {
    orgRepo = mockOrgRepo()
    workspaceRepo = mockWorkspaceRepo()
    sessionStore = mockSessionStore()
    executeQuery = mockExecuteQuery()
    providerRegistry = {
      get: vi.fn().mockReturnValue({
        models: [{ id: 'claude-haiku-4-20250506', label: 'Haiku' }],
        createSimpleMessage: vi.fn().mockResolvedValue('no'),
      }),
    } as unknown as typeof ProviderRegistryType
    useCase = new RouteMessageUseCase(workspaceRepo, orgRepo, sessionStore, executeQuery, providerRegistry)
  })

  it('uses existing session to route directly to workspace', async () => {
    vi.mocked(sessionStore.get).mockResolvedValue({
      workspaceId: 'ws-insurance',
      lastMessageAt: Date.now(),
      routedFrom: 'ws-general',
    })

    const result = await useCase.execute(baseInput)

    expect(executeQuery.execute).toHaveBeenCalledWith('ws-insurance', baseInput.query, expect.objectContaining({
      consumerType: 'whatsapp',
    }))
    expect(result.routed).toBe(false)
    expect(result.workspaceId).toBe('ws-insurance')
    // Session TTL should be refreshed
    expect(sessionStore.set).toHaveBeenCalled()
  })

  it('routes via receptionist when no session exists and LLM returns routing directive', async () => {
    const defaultWs = stubWorkspace({ id: 'ws-general', name: '#general', is_default: true })
    const targetWs = stubWorkspace({ id: 'ws-insurance', name: 'Insurance' })

    vi.mocked(workspaceRepo.findDefaultByOrg).mockResolvedValue(defaultWs)
    vi.mocked(orgRepo.findById).mockResolvedValue({ id: 'org-1', name: 'Acme Corp', slug: 'acme-corp', created_at: '2024-01-01' })
    vi.mocked(workspaceRepo.listRoutingSummaries).mockResolvedValue([
      { id: 'ws-insurance', name: 'Insurance', system_prompt: 'Claims.', tool_names: ['create_claim'] },
    ])
    vi.mocked(workspaceRepo.findActiveById).mockResolvedValue(targetWs)

    // Receptionist decides to route
    vi.mocked(executeQuery.execute).mockResolvedValue({
      answer: "I'll connect you with our insurance team.\n<!-- ROUTE:ws-insurance:User asked about car accident -->",
      conversationId: 'conv-1',
      sessionId: 'session-1',
      toolsCalled: [],
      connectionsHit: [],
      tokensInput: 10,
      tokensOutput: 20,
      costUsd: 0.001,
      durationMs: 100,
      error: null,
    })

    const result = await useCase.execute(baseInput)

    expect(result.routed).toBe(true)
    expect(result.routedTo).toBe('Insurance')
    expect(result.answer).toContain('[Routed to Insurance]')
    expect(result.answer).not.toContain('<!-- ROUTE')
    expect(sessionStore.set).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ workspaceId: 'ws-insurance' }),
      1800,
    )
  })

  it('stays on #general when receptionist asks clarifying question', async () => {
    const defaultWs = stubWorkspace({ id: 'ws-general', name: '#general', is_default: true })

    vi.mocked(workspaceRepo.findDefaultByOrg).mockResolvedValue(defaultWs)
    vi.mocked(orgRepo.findById).mockResolvedValue({ id: 'org-1', name: 'Acme Corp', slug: 'acme-corp', created_at: '2024-01-01' })
    vi.mocked(workspaceRepo.listRoutingSummaries).mockResolvedValue([
      { id: 'ws-insurance', name: 'Insurance', system_prompt: 'Claims.', tool_names: [] },
      { id: 'ws-banking', name: 'Banking', system_prompt: 'Accounts.', tool_names: [] },
    ])

    vi.mocked(executeQuery.execute).mockResolvedValue({
      answer: 'Are you looking at your insurance or your bank account?',
      conversationId: 'conv-1',
      sessionId: 'session-1',
      toolsCalled: [],
      connectionsHit: [],
      tokensInput: 10,
      tokensOutput: 20,
      costUsd: 0.001,
      durationMs: 100,
      error: null,
    })

    const result = await useCase.execute(baseInput)

    expect(result.routed).toBe(false)
    expect(result.workspaceId).toBe('ws-general')
    expect(sessionStore.set).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ workspaceId: 'ws-general' }),
      1800,
    )
  })

  it('routes directly when no specialised workspaces exist', async () => {
    const defaultWs = stubWorkspace({ id: 'ws-general', name: '#general', is_default: true })

    vi.mocked(workspaceRepo.findDefaultByOrg).mockResolvedValue(defaultWs)
    vi.mocked(orgRepo.findById).mockResolvedValue({ id: 'org-1', name: 'Acme Corp', slug: 'acme-corp', created_at: '2024-01-01' })
    vi.mocked(workspaceRepo.listRoutingSummaries).mockResolvedValue([])

    const result = await useCase.execute(baseInput)

    expect(result.workspaceId).toBe('ws-general')
    expect(result.routed).toBe(false)
    // Should execute directly without receptionist prompt override
    expect(executeQuery.execute).toHaveBeenCalledWith('ws-general', baseInput.query, expect.not.objectContaining({
      systemPromptOverride: expect.any(String),
    }))
  })

  it('passes systemPromptOverride and skipTools for receptionist calls', async () => {
    const defaultWs = stubWorkspace({ id: 'ws-general', name: '#general', is_default: true })

    vi.mocked(workspaceRepo.findDefaultByOrg).mockResolvedValue(defaultWs)
    vi.mocked(orgRepo.findById).mockResolvedValue({ id: 'org-1', name: 'Acme Corp', slug: 'acme-corp', created_at: '2024-01-01' })
    vi.mocked(workspaceRepo.listRoutingSummaries).mockResolvedValue([
      { id: 'ws-support', name: 'Support', system_prompt: 'Help desk.', tool_names: [] },
    ])

    await useCase.execute(baseInput)

    expect(executeQuery.execute).toHaveBeenCalledWith('ws-general', baseInput.query, expect.objectContaining({
      systemPromptOverride: expect.stringContaining('receptionist for Acme Corp'),
      skipTools: true,
    }))
  })
})
