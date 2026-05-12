import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockOrgRepo, mockWorkspaceRepo, mockConversationRepo, stubWorkspace } from '../../__tests__/mocks.js'
import { RouteMessageUseCase } from './RouteMessageUseCase.js'
import type { SessionStore } from '../ports/SessionStore.js'
import type { ExecuteQueryUseCase } from '../query/ExecuteQueryUseCase.js'

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
  let useCase: RouteMessageUseCase

  beforeEach(() => {
    orgRepo = mockOrgRepo()
    workspaceRepo = mockWorkspaceRepo()
    sessionStore = mockSessionStore()
    executeQuery = mockExecuteQuery()
    useCase = new RouteMessageUseCase(workspaceRepo, orgRepo, mockConversationRepo(), sessionStore, executeQuery)
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

  it('checks redirect intent when session has pendingRedirect true and user accepts', async () => {
    const defaultWs = stubWorkspace({ id: 'ws-general', name: '#general', is_default: true })

    vi.mocked(sessionStore.get).mockResolvedValue({
      workspaceId: 'ws-insurance',
      lastMessageAt: Date.now(),
      routedFrom: '#general',
      pendingRedirect: true,
    })
    vi.mocked(workspaceRepo.findDefaultByOrg).mockResolvedValue(defaultWs)
    vi.mocked(orgRepo.findById).mockResolvedValue({ id: 'org-1', name: 'Acme Corp', slug: 'acme-corp', created_at: '2024-01-01' })
    vi.mocked(workspaceRepo.listRoutingSummaries).mockResolvedValue([
      { id: 'ws-insurance', name: 'Insurance', system_prompt: 'Claims.', tool_names: [] },
    ])
    vi.mocked(workspaceRepo.findActiveById).mockResolvedValue(
      stubWorkspace({ id: 'ws-insurance', name: 'Insurance' }),
    )

    // First call: redirect intent classifier says "yes"
    // Second call: receptionist routes the message
    vi.mocked(executeQuery.execute)
      .mockResolvedValueOnce({
        answer: 'yes',
        conversationId: 'conv-intent',
        sessionId: 'session-intent',
        toolsCalled: [],
        connectionsHit: [],
        tokensInput: 5,
        tokensOutput: 2,
        costUsd: 0.0001,
        durationMs: 50,
        error: null,
      })
      .mockResolvedValueOnce({
        answer: "I'll redirect you.\n<!-- ROUTE:ws-insurance:User wants redirect -->",
        conversationId: 'conv-2',
        sessionId: 'session-2',
        toolsCalled: [],
        connectionsHit: [],
        tokensInput: 10,
        tokensOutput: 20,
        costUsd: 0.001,
        durationMs: 100,
        error: null,
      })

    const result = await useCase.execute({ ...baseInput, query: 'Yes please' })

    // Session should have been deleted before re-routing
    expect(sessionStore.delete).toHaveBeenCalled()
    expect(result.routed).toBe(true)
  })

  it('continues in current workspace when pendingRedirect is true but user declines', async () => {
    vi.mocked(sessionStore.get).mockResolvedValue({
      workspaceId: 'ws-insurance',
      lastMessageAt: Date.now(),
      routedFrom: '#general',
      pendingRedirect: true,
    })
    vi.mocked(workspaceRepo.findDefaultByOrg).mockResolvedValue(
      stubWorkspace({ id: 'ws-general', name: '#general', is_default: true }),
    )

    // Intent classifier says "no"
    vi.mocked(executeQuery.execute)
      .mockResolvedValueOnce({
        answer: 'no',
        conversationId: 'conv-intent',
        sessionId: 'session-intent',
        toolsCalled: [],
        connectionsHit: [],
        tokensInput: 5,
        tokensOutput: 2,
        costUsd: 0.0001,
        durationMs: 50,
        error: null,
      })
      .mockResolvedValueOnce({
        answer: 'OK, how else can I help?',
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

    const result = await useCase.execute({ ...baseInput, query: 'No thanks' })

    // Should NOT have deleted the session
    expect(sessionStore.delete).not.toHaveBeenCalled()
    // Should execute in the current workspace
    expect(result.workspaceId).toBe('ws-insurance')
    expect(result.routed).toBe(false)
  })

  it('detects redirect offer in response and sets pendingRedirect', async () => {
    vi.mocked(sessionStore.get).mockResolvedValue({
      workspaceId: 'ws-insurance',
      lastMessageAt: Date.now(),
      routedFrom: '#general',
    })

    vi.mocked(executeQuery.execute).mockResolvedValue({
      answer: 'That falls outside what I can help with here. Would you like me to redirect you to someone who can help?',
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

    await useCase.execute(baseInput)

    expect(sessionStore.set).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ pendingRedirect: true }),
      1800,
    )
  })

  it('does not set pendingRedirect when answer is normal', async () => {
    vi.mocked(sessionStore.get).mockResolvedValue({
      workspaceId: 'ws-insurance',
      lastMessageAt: Date.now(),
      routedFrom: '#general',
    })

    vi.mocked(executeQuery.execute).mockResolvedValue({
      answer: 'Your claim has been filed successfully.',
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

    await useCase.execute(baseInput)

    expect(sessionStore.set).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ pendingRedirect: false }),
      1800,
    )
  })

  it('refreshes session TTL on every message in existing session', async () => {
    vi.mocked(sessionStore.get).mockResolvedValue({
      workspaceId: 'ws-insurance',
      lastMessageAt: Date.now() - 60000,
      routedFrom: '#general',
    })

    await useCase.execute(baseInput)

    expect(sessionStore.set).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        workspaceId: 'ws-insurance',
        lastMessageAt: expect.any(Number),
      }),
      1800,
    )
  })

  it('records routing metadata on conversation when routing happens', async () => {
    const conversationRepo = mockConversationRepo()
    const localUseCase = new RouteMessageUseCase(workspaceRepo, orgRepo, conversationRepo, sessionStore, executeQuery)

    const defaultWs = stubWorkspace({ id: 'ws-general', name: '#general', is_default: true })
    const targetWs = stubWorkspace({ id: 'ws-insurance', name: 'Insurance' })

    vi.mocked(workspaceRepo.findDefaultByOrg).mockResolvedValue(defaultWs)
    vi.mocked(orgRepo.findById).mockResolvedValue({ id: 'org-1', name: 'Acme Corp', slug: 'acme-corp', created_at: '2024-01-01' })
    vi.mocked(workspaceRepo.listRoutingSummaries).mockResolvedValue([
      { id: 'ws-insurance', name: 'Insurance', system_prompt: 'Claims.', tool_names: [] },
    ])
    vi.mocked(workspaceRepo.findActiveById).mockResolvedValue(targetWs)
    vi.mocked(executeQuery.execute).mockResolvedValue({
      answer: "Connecting you now.\n<!-- ROUTE:ws-insurance:Car accident -->",
      conversationId: 'conv-routed',
      sessionId: 'session-1',
      toolsCalled: [],
      connectionsHit: [],
      tokensInput: 10,
      tokensOutput: 20,
      costUsd: 0.001,
      durationMs: 100,
      error: null,
    })

    await localUseCase.execute(baseInput)

    expect(conversationRepo.updateRouting).toHaveBeenCalledWith(
      'conv-routed', '#general', 'Insurance', 'Car accident',
    )
  })

  it('falls back to #general when receptionist routes to non-existent workspace', async () => {
    const defaultWs = stubWorkspace({ id: 'ws-general', name: '#general', is_default: true })

    vi.mocked(workspaceRepo.findDefaultByOrg).mockResolvedValue(defaultWs)
    vi.mocked(orgRepo.findById).mockResolvedValue({ id: 'org-1', name: 'Acme Corp', slug: 'acme-corp', created_at: '2024-01-01' })
    vi.mocked(workspaceRepo.listRoutingSummaries).mockResolvedValue([
      { id: 'ws-deleted', name: 'Deleted', system_prompt: 'Gone.', tool_names: [] },
    ])
    vi.mocked(workspaceRepo.findActiveById).mockResolvedValue(null)
    vi.mocked(executeQuery.execute).mockResolvedValue({
      answer: "Let me connect you.\n<!-- ROUTE:ws-deleted:test -->",
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
    expect(result.answer).not.toContain('<!-- ROUTE')
  })
})
