import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockOrgRepo, mockWorkspaceRepo, mockConversationRepo, mockManageConversationUseCase, stubWorkspace } from '../../__tests__/mocks.js'
import { RouteMessageUseCase } from './RouteMessageUseCase.js'
import { WorkspaceMatcher } from './WorkspaceMatcher.js'
import { ReceptionistRouter } from './ReceptionistRouter.js'
import type { SessionStore } from '../ports/SessionStore.js'
import type { ExecuteQueryUseCase } from '../query/ExecuteQueryUseCase.js'
import type { ManageConversationUseCase } from '../conversation/ManageConversationUseCase.js'

function mockSessionStore(): SessionStore {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    getRecentQueryCount: vi.fn().mockResolvedValue(0),
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
    const convRepo = mockConversationRepo()
    const convUseCase = mockManageConversationUseCase() as ManageConversationUseCase
    const matcher = new WorkspaceMatcher(workspaceRepo, orgRepo, executeQuery)
    const router = new ReceptionistRouter(workspaceRepo, convRepo, sessionStore, convUseCase, matcher)
    useCase = new RouteMessageUseCase(workspaceRepo, sessionStore, executeQuery, convUseCase, matcher, router)
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

  it('routes via receptionist and the target workspace answers immediately', async () => {
    const defaultWs = stubWorkspace({ id: 'ws-general', name: '#general', is_default: true })
    const targetWs = stubWorkspace({ id: 'ws-insurance', name: 'Insurance' })

    vi.mocked(workspaceRepo.findDefaultByOrg).mockResolvedValue(defaultWs)
    vi.mocked(orgRepo.findById).mockResolvedValue({ id: 'org-1', name: 'Acme Corp', slug: 'acme-corp', created_at: '2024-01-01' })
    vi.mocked(workspaceRepo.listRoutingSummaries).mockResolvedValue([
      { id: 'ws-insurance', name: 'Insurance', system_prompt: 'Claims.', tool_names: ['create_claim'] },
    ])
    vi.mocked(workspaceRepo.findActiveById).mockResolvedValue(targetWs)

    // No existing session, then the session the router just created on route.
    vi.mocked(sessionStore.get)
      .mockResolvedValueOnce(null)
      .mockResolvedValue({
        workspaceId: 'ws-insurance',
        lastMessageAt: Date.now(),
        routedFrom: '#general',
        routedFromConversationId: 'conv-general',
        generalConversationId: 'conv-general',
      })

    // First execute: receptionist routes. Second execute: target workspace answers.
    vi.mocked(executeQuery.execute)
      .mockResolvedValueOnce({
        answer: "I'll connect you with our insurance team.\n<!-- ROUTE:ws-insurance:User asked about car accident -->",
        conversationId: 'conv-general', sessionId: 'session-1', toolsCalled: [], connectionsHit: [],
        tokensInput: 10, tokensOutput: 20, costUsd: 0.001, durationMs: 100, error: null,
      })
      .mockResolvedValueOnce({
        answer: 'To file an accident claim, you can do it online or call our claims line.',
        conversationId: 'conv-insurance', sessionId: 'session-1', toolsCalled: [], connectionsHit: [],
        tokensInput: 10, tokensOutput: 20, costUsd: 0.001, durationMs: 100, error: null,
      })

    const result = await useCase.execute(baseInput)

    expect(result.routed).toBe(true)
    expect(result.routedTo).toBe('Insurance')
    // The routed workspace answers immediately, not a "connecting you" filler.
    expect(result.answer).toBe('To file an accident claim, you can do it online or call our claims line.')
    expect(result.answer).not.toContain('<!-- ROUTE')
    // The original query is executed in the target workspace, carrying reception scope.
    expect(executeQuery.execute).toHaveBeenLastCalledWith('ws-insurance', baseInput.query, expect.objectContaining({
      routedFrom: '#general',
    }))
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
      // Third call: the routed Insurance workspace answers immediately
      .mockResolvedValueOnce({
        answer: 'What would you like to know about your insurance policy?',
        conversationId: 'conv-insurance',
        sessionId: 'session-3',
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
    expect(result.routedTo).toBe('Insurance')
    // The redirect answers immediately in the target, not a "connecting you" message
    expect(result.answer).toBe('What would you like to know about your insurance policy?')
    expect(executeQuery.execute).toHaveBeenLastCalledWith('ws-insurance', 'Yes please', expect.anything())
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

  it('emits scope change when routed workspace refuses query', async () => {
    const insuranceWs = stubWorkspace({ id: 'ws-insurance', name: 'Insurance' })
    vi.mocked(workspaceRepo.findActiveById).mockResolvedValue(insuranceWs)

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

    const result = await useCase.execute(baseInput)

    // Should NOT auto-re-route
    expect(sessionStore.delete).not.toHaveBeenCalled()
    expect(executeQuery.execute).toHaveBeenCalledTimes(1)
    // Should emit scope change with user-friendly message
    expect(result.scopeChange).toEqual({
      currentWorkspace: 'Insurance',
      currentWorkspaceId: 'ws-insurance',
    })
    expect(result.answer).toContain('outside the scope of Insurance')
    // pendingRedirect should be set for next message
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
    const localConvUseCase = mockManageConversationUseCase() as ManageConversationUseCase
    const localMatcher = new WorkspaceMatcher(workspaceRepo, orgRepo, executeQuery)
    const localRouter = new ReceptionistRouter(workspaceRepo, conversationRepo, sessionStore, localConvUseCase, localMatcher)
    const localUseCase = new RouteMessageUseCase(workspaceRepo, sessionStore, executeQuery, localConvUseCase, localMatcher, localRouter)

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

  it('session on #general without routedFrom always uses receptionist prompt', async () => {
    const defaultWs = stubWorkspace({ id: 'ws-general', name: '#general', is_default: true })

    // Session exists on #general but has not been routed (routedFrom is null)
    vi.mocked(sessionStore.get).mockResolvedValue({
      workspaceId: 'ws-general',
      lastMessageAt: Date.now(),
      routedFrom: null,
    })
    vi.mocked(workspaceRepo.findDefaultByOrg).mockResolvedValue(defaultWs)
    vi.mocked(orgRepo.findById).mockResolvedValue({ id: 'org-1', name: 'Acme Corp', slug: 'acme-corp', created_at: '2024-01-01' })
    vi.mocked(workspaceRepo.listRoutingSummaries).mockResolvedValue([
      { id: 'ws-insurance', name: 'Insurance', system_prompt: 'Claims.', tool_names: [] },
    ])

    await useCase.execute({ ...baseInput, query: 'refund' })

    // Should use receptionist prompt, not direct execute
    expect(executeQuery.execute).toHaveBeenCalledWith('ws-general', 'refund', expect.objectContaining({
      systemPromptOverride: expect.stringContaining('receptionist for Acme Corp'),
      skipTools: true,
    }))
  })

  it('session on #general with routedFrom routes directly (already been routed)', async () => {
    // Session on #general but WITH routedFrom means user was re-routed back
    vi.mocked(sessionStore.get).mockResolvedValue({
      workspaceId: 'ws-general',
      lastMessageAt: Date.now(),
      routedFrom: '#general',
    })
    // findDefaultByOrg should NOT match because routedFrom is set
    vi.mocked(workspaceRepo.findDefaultByOrg).mockResolvedValue(
      stubWorkspace({ id: 'ws-general', name: '#general', is_default: true }),
    )

    await useCase.execute(baseInput)

    // Should go direct (not receptionist) because routedFrom is set
    expect(executeQuery.execute).toHaveBeenCalledWith('ws-general', baseInput.query, expect.not.objectContaining({
      systemPromptOverride: expect.any(String),
    }))
  })

  it('receptionist does not answer out-of-scope questions (returns to user)', async () => {
    const defaultWs = stubWorkspace({ id: 'ws-general', name: '#general', is_default: true })

    vi.mocked(workspaceRepo.findDefaultByOrg).mockResolvedValue(defaultWs)
    vi.mocked(orgRepo.findById).mockResolvedValue({ id: 'org-1', name: 'Acme Corp', slug: 'acme-corp', created_at: '2024-01-01' })
    vi.mocked(workspaceRepo.listRoutingSummaries).mockResolvedValue([
      { id: 'ws-insurance', name: 'Insurance', system_prompt: 'Claims.', tool_names: [] },
    ])

    // Receptionist says no matching department (no routing directive)
    vi.mocked(executeQuery.execute).mockResolvedValue({
      answer: 'I do not have a department that handles refunds. I can help with Insurance.',
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

    const result = await useCase.execute({ ...baseInput, query: 'refund' })

    expect(result.routed).toBe(false)
    expect(result.workspaceId).toBe('ws-general')
    expect(result.answer).toContain('do not have a department')
  })

  it('logs messages to #general master conversation after routing', async () => {
    const mockConvUseCase = mockManageConversationUseCase()

    const localConvRepo = mockConversationRepo()
    const localMatcher = new WorkspaceMatcher(workspaceRepo, orgRepo, executeQuery)
    const localRouter = new ReceptionistRouter(workspaceRepo, localConvRepo, sessionStore, mockConvUseCase as ManageConversationUseCase, localMatcher)
    const localUseCase = new RouteMessageUseCase(workspaceRepo, sessionStore, executeQuery, mockConvUseCase as ManageConversationUseCase, localMatcher, localRouter)

    // Session on target workspace with generalConversationId set
    vi.mocked(sessionStore.get).mockResolvedValue({
      workspaceId: 'ws-insurance',
      lastMessageAt: Date.now(),
      routedFrom: '#general',
      generalConversationId: 'conv-general-master',
    })
    vi.mocked(workspaceRepo.findDefaultByOrg).mockResolvedValue(
      stubWorkspace({ id: 'ws-general', name: '#general', is_default: true }),
    )

    vi.mocked(executeQuery.execute).mockResolvedValue({
      answer: 'Here is your claim status.',
      conversationId: 'conv-insurance',
      sessionId: 'session-1',
      toolsCalled: [],
      connectionsHit: [],
      tokensInput: 10,
      tokensOutput: 20,
      costUsd: 0.001,
      durationMs: 100,
      error: null,
    })

    await localUseCase.execute({ ...baseInput, query: 'Check my claim' })

    // Should log both query and answer to #general master conversation
    expect(mockConvUseCase.recordMessage).toHaveBeenCalledWith('conv-general-master', 'user', 'Check my claim')
    expect(mockConvUseCase.recordMessage).toHaveBeenCalledWith('conv-general-master', 'assistant', 'Here is your claim status.')
  })

  it('passes prior history from receptionist to target workspace', async () => {
    const mockConvUseCase = mockManageConversationUseCase()
    vi.mocked(mockConvUseCase.getHistory).mockResolvedValue([
      { role: 'user', content: 'I need insurance help' },
      { role: 'assistant', content: 'Connecting you to Insurance.' },
    ])

    const localConvRepo = mockConversationRepo()
    const localMatcher = new WorkspaceMatcher(workspaceRepo, orgRepo, executeQuery)
    const localRouter = new ReceptionistRouter(workspaceRepo, localConvRepo, sessionStore, mockConvUseCase as ManageConversationUseCase, localMatcher)
    const localUseCase = new RouteMessageUseCase(workspaceRepo, sessionStore, executeQuery, mockConvUseCase as ManageConversationUseCase, localMatcher, localRouter)

    // Session already routed to insurance with receptionist conversation ID
    vi.mocked(sessionStore.get).mockResolvedValue({
      workspaceId: 'ws-insurance',
      lastMessageAt: Date.now(),
      routedFrom: '#general',
      routedFromConversationId: 'conv-receptionist',
      generalConversationId: 'conv-receptionist',
    })
    vi.mocked(workspaceRepo.findDefaultByOrg).mockResolvedValue(
      stubWorkspace({ id: 'ws-general', name: '#general', is_default: true }),
    )

    await localUseCase.execute({ ...baseInput, query: 'My policy number is 12345' })

    // Should pass prior history to the target workspace
    expect(executeQuery.execute).toHaveBeenCalledWith('ws-insurance', 'My policy number is 12345', expect.objectContaining({
      priorHistory: [
        { role: 'user', content: 'I need insurance help' },
        { role: 'assistant', content: 'Connecting you to Insurance.' },
      ],
    }))
  })

  it('passes stable sessionKey so conversation accumulates all messages', async () => {
    const defaultWs = stubWorkspace({ id: 'ws-general', name: '#general', is_default: true })

    vi.mocked(workspaceRepo.findDefaultByOrg).mockResolvedValue(defaultWs)
    vi.mocked(orgRepo.findById).mockResolvedValue({ id: 'org-1', name: 'Acme Corp', slug: 'acme-corp', created_at: '2024-01-01' })
    vi.mocked(workspaceRepo.listRoutingSummaries).mockResolvedValue([
      { id: 'ws-support', name: 'Support', system_prompt: 'Help.', tool_names: [] },
    ])

    await useCase.execute(baseInput)

    // sessionId should be the stable session key, not a timestamp-based ID
    const expectedKey = `session:${baseInput.consumerType}:${baseInput.entryPoint}:${baseInput.userId}`
    expect(executeQuery.execute).toHaveBeenCalledWith('ws-general', baseInput.query, expect.objectContaining({
      sessionId: expectedKey,
    }))
  })

  it('routed workspace also receives stable sessionKey', async () => {
    vi.mocked(sessionStore.get).mockResolvedValue({
      workspaceId: 'ws-insurance',
      lastMessageAt: Date.now(),
      routedFrom: '#general',
    })
    vi.mocked(workspaceRepo.findDefaultByOrg).mockResolvedValue(
      stubWorkspace({ id: 'ws-general', name: '#general', is_default: true }),
    )

    await useCase.execute(baseInput)

    const expectedKey = `session:${baseInput.consumerType}:${baseInput.entryPoint}:${baseInput.userId}`
    expect(executeQuery.execute).toHaveBeenCalledWith('ws-insurance', baseInput.query, expect.objectContaining({
      sessionId: expectedKey,
    }))
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
