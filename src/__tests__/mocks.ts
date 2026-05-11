import { vi } from 'vitest'
import type { OrganisationRepository, UserData, OrgSettingData, TeamData } from '../domain/organisation/repository.js'
import type { WorkspaceRepository, WorkspaceData, ConnectionData, ConsumerData, WorkspaceStatsData, WorkspaceListItemData } from '../domain/workspace/repository.js'
import type { ConversationRepository, ConversationData, ConversationStatsData as ConvStatsData, ConversationFilterData, ColdTransitionData } from '../domain/conversation/repository.js'
import type { AuditLogRepository } from '../domain/audit/repository.js'
import type { PasswordService } from '../application/ports/PasswordService.js'
import type { TokenService, TokenPayload } from '../application/ports/TokenService.js'
import type { QueueService, QueueJobCounts } from '../application/ports/QueueService.js'
import type { IntegrationTester } from '../application/ports/IntegrationTester.js'
import type { McpClientFactory, McpConnection } from '../application/ports/McpClient.js'
import type { AIProvider } from '../application/ports/AIProvider.js'
import type { ModelRepository } from '../application/ports/ModelRepository.js'
import type { ConsumerPosterRegistry } from '../application/ports/ConsumerPoster.js'

// ── Stub data ──

export function stubUser(overrides: Partial<UserData> = {}): UserData {
  return {
    id: 'user-1', org_id: 'org-1', email: 'test@example.com', name: 'Test User',
    password_hash: '$2b$12$hashedpassword', org_role: 'admin', created_at: '2024-01-01',
    ...overrides,
  }
}

export function stubWorkspace(overrides: Partial<WorkspaceData> = {}): WorkspaceData {
  return {
    id: 'ws-test', org_id: 'org-1', team_id: 'team-1', name: 'Test Workspace',
    status: 'active', model: 'claude-sonnet-4-20250514', system_prompt: 'You are helpful.',
    max_tool_rounds: 10, max_thread_history: 50, cold_timeout_minutes: 30,
    close_timeout_minutes: 60, is_default: false, created_by: 'user-1', created_at: '2024-01-01',
    updated_at: '2024-01-01',
    ...overrides,
  }
}

export function stubConversation(overrides: Partial<ConversationData> = {}): ConversationData {
  return {
    id: 'conv-1', workspace_id: 'ws-test', consumer_type: 'api',
    external_thread_id: 'thread-1', status: 'open', user_id: 'user-1',
    user_name: 'Test User', channel: null, message_count: 2,
    first_message_at: '2024-01-01', last_activity_at: '2024-01-01',
    cold_at: null, closed_at: null,
    routed_from: null, routed_to: null, route_reason: null,
    created_at: '2024-01-01', updated_at: '2024-01-01',
    ...overrides,
  }
}

export function stubConnection(overrides: Partial<ConnectionData> = {}): ConnectionData {
  return {
    id: 'conn-1', workspace_id: 'ws-test', name: 'test-mcp',
    type: 'mcp', status: 'connected', config: '{"transport":"http","url":"http://localhost:8080"}',
    ...overrides,
  }
}

export function stubConsumer(overrides: Partial<ConsumerData> = {}): ConsumerData {
  return {
    id: 'consumer-1', workspace_id: 'ws-test', type: 'slack',
    config: '{"channels":["C123"]}', status: 'active',
    ...overrides,
  }
}

// ── Mock factories ──

export function mockOrgRepo(): OrganisationRepository {
  return {
    findById: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue(undefined),
    updateName: vi.fn().mockResolvedValue(undefined),
    findUserByEmail: vi.fn().mockResolvedValue(null),
    findUserById: vi.fn().mockResolvedValue(null),
    userExistsByEmail: vi.fn().mockResolvedValue(false),
    createUser: vi.fn().mockResolvedValue(undefined),
    listUsers: vi.fn().mockResolvedValue([]),
    listSettings: vi.fn().mockResolvedValue([]),
    findSetting: vi.fn().mockResolvedValue(null),
    upsertSetting: vi.fn().mockResolvedValue(undefined),
    getSettingValue: vi.fn().mockResolvedValue(null),
    getSettingValues: vi.fn().mockResolvedValue({}),
    listTeams: vi.fn().mockResolvedValue([]),
    findTeamByName: vi.fn().mockResolvedValue(null),
    createTeam: vi.fn().mockResolvedValue(undefined),
    getFirstOrgId: vi.fn().mockResolvedValue('org-1'),
  }
}

export function mockWorkspaceRepo(): WorkspaceRepository {
  return {
    findById: vi.fn().mockResolvedValue(null),
    findByIdWithTeam: vi.fn().mockResolvedValue(null),
    findActiveById: vi.fn().mockResolvedValue(null),
    existsById: vi.fn().mockResolvedValue(false),
    create: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    listNonArchived: vi.fn().mockResolvedValue([]),
    getSummary: vi.fn().mockResolvedValue(null),
    findConnections: vi.fn().mockResolvedValue([]),
    findConnectionConfigs: vi.fn().mockResolvedValue([]),
    findConnectionByName: vi.fn().mockResolvedValue(null),
    createConnection: vi.fn().mockResolvedValue(undefined),
    updateConnectionConfig: vi.fn().mockResolvedValue(undefined),
    updateConnectionStatus: vi.fn().mockResolvedValue(undefined),
    deleteConnection: vi.fn().mockResolvedValue(undefined),
    findTools: vi.fn().mockResolvedValue([]),
    findToolsDetailed: vi.fn().mockResolvedValue([]),
    deleteToolsByConnection: vi.fn().mockResolvedValue(undefined),
    createTools: vi.fn().mockResolvedValue(undefined),
    findConsumers: vi.fn().mockResolvedValue([]),
    findConsumerByType: vi.fn().mockResolvedValue(null),
    createConsumer: vi.fn().mockResolvedValue(undefined),
    updateConsumerConfig: vi.fn().mockResolvedValue(undefined),
    findConsumerBoundToChannel: vi.fn().mockResolvedValue(null),
    findConsumersByType: vi.fn().mockResolvedValue([]),
    findKnowledge: vi.fn().mockResolvedValue([]),
    findGuardrails: vi.fn().mockResolvedValue([]),
    findEnabledGuardrailConfigs: vi.fn().mockResolvedValue([]),
    enableGuardrail: vi.fn().mockResolvedValue(undefined),
    disableGuardrail: vi.fn().mockResolvedValue(undefined),
    findPermissions: vi.fn().mockResolvedValue([]),
    getStats: vi.fn().mockResolvedValue({ today: 0, week: 0, month: 0, avg_ms: 0, cost_mtd: 0, errors_week: 0, total_week: 0 }),
    getActiveWorkspaceCount: vi.fn().mockResolvedValue(0),
    getConnectedConnectionCount: vi.fn().mockResolvedValue(0),
    getActiveConsumerCount: vi.fn().mockResolvedValue(0),
    getFirstActiveWorkspace: vi.fn().mockResolvedValue(null),
    findActivityLog: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
    findDefaultByOrg: vi.fn().mockResolvedValue(null),
    listRoutingSummaries: vi.fn().mockResolvedValue([]),
    setDefault: vi.fn().mockResolvedValue(undefined),
  }
}

export function mockConversationRepo(): ConversationRepository {
  return {
    findById: vi.fn().mockResolvedValue(null),
    findLatestByThread: vi.fn().mockResolvedValue(null),
    findByExternalThreadId: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue(undefined),
    updateStatus: vi.fn().mockResolvedValue(undefined),
    reopenFromCold: vi.fn().mockResolvedValue(undefined),
    closeConversation: vi.fn().mockResolvedValue(undefined),
    listWithStats: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
    getFilters: vi.fn().mockResolvedValue({ status: [], consumer: [], category: [], resolution: [] }),
    findMessages: vi.fn().mockResolvedValue([]),
    findMessagesWithAudit: vi.fn().mockResolvedValue([]),
    recordMessage: vi.fn().mockResolvedValue(undefined),
    getNextSeq: vi.fn().mockResolvedValue(1),
    incrementMessageCount: vi.fn().mockResolvedValue(undefined),
    findStats: vi.fn().mockResolvedValue(null),
    createStats: vi.fn().mockResolvedValue(undefined),
    updateStatsStatus: vi.fn().mockResolvedValue(undefined),
    updateStatsComplete: vi.fn().mockResolvedValue(undefined),
    getAggregateData: vi.fn().mockResolvedValue({ total_tokens_input: 0, total_tokens_output: 0, total_cost_usd: 0, total_duration_ms: 0, query_count: 0 }),
    getTimestamps: vi.fn().mockResolvedValue(null),
    getWorkspaceModel: vi.fn().mockResolvedValue(null),
    findColdTransitionCandidates: vi.fn().mockResolvedValue([]),
    batchTransitionToCold: vi.fn().mockResolvedValue(undefined),
    findCloseTransitionCandidates: vi.fn().mockResolvedValue([]),
    batchTransitionToClosed: vi.fn().mockResolvedValue(undefined),
    getTicketSummary: vi.fn().mockResolvedValue({ open: 0, cold: 0, closed_today: 0, closed_week: 0 }),
    getSentimentDistribution: vi.fn().mockResolvedValue([]),
    getComplianceStats: vi.fn().mockResolvedValue([]),
    getKnowledgeGapStats: vi.fn().mockResolvedValue([]),
    getKnowledgeGapsByWorkspace: vi.fn().mockResolvedValue([]),
    getComplianceViolationsByWorkspace: vi.fn().mockResolvedValue([]),
    getResolutionDistribution: vi.fn().mockResolvedValue([]),
    getCategoryDistribution: vi.fn().mockResolvedValue([]),
    getChannelDistribution: vi.fn().mockResolvedValue([]),
    getCostAndUsage: vi.fn().mockResolvedValue({ cost_today: 0, cost_week: 0, cost_month: 0, q_today: 0, q_week: 0, q_month: 0 }),
    getRecentConversations: vi.fn().mockResolvedValue([]),
  }
}

export function mockAuditRepo(): AuditLogRepository {
  return { create: vi.fn().mockResolvedValue(undefined) }
}

export function mockPasswordService(): PasswordService {
  return {
    hash: vi.fn().mockResolvedValue('hashed-password'),
    verify: vi.fn().mockResolvedValue(true),
  }
}

export function mockTokenService(): TokenService {
  return {
    sign: vi.fn().mockReturnValue('mock-token'),
    verify: vi.fn().mockReturnValue({ id: 'user-1', email: 'test@example.com', name: 'Test', role: 'admin', org_id: 'org-1' }),
  }
}

export function mockQueueService(): QueueService {
  return {
    addColdMessage: vi.fn().mockResolvedValue(undefined),
    addStatsJob: vi.fn().mockResolvedValue(undefined),
    getJobCounts: vi.fn().mockResolvedValue({ waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 }),
    getFailedJobs: vi.fn().mockResolvedValue([]),
    retryAllFailed: vi.fn().mockResolvedValue(0),
    drainQueue: vi.fn().mockResolvedValue(undefined),
    listQueueNames: vi.fn().mockReturnValue(['lifecycle', 'cold-messages', 'conversation-stats']),
  }
}

export function mockIntegrationTester(): IntegrationTester {
  return {
    test: vi.fn().mockResolvedValue({ ok: true, detail: { bot_name: 'bot', team: 'team' } }),
    supports: vi.fn().mockReturnValue(true),
  }
}

export function mockMcpFactory(): McpClientFactory {
  const mockConnection: McpConnection = {
    tools: [{ name: 'test-tool', description: 'A test tool', inputSchema: { type: 'object', properties: {} } }],
    callTool: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'result' }], isError: false }),
    close: vi.fn().mockResolvedValue(undefined),
  }
  return {
    connectHttp: vi.fn().mockResolvedValue(mockConnection),
    connectStdio: vi.fn().mockResolvedValue(mockConnection),
    testHttp: vi.fn().mockResolvedValue({ ok: true, tools: 1, server: 'test', toolNames: ['test-tool'] }),
  }
}

export function mockAIProvider(): AIProvider {
  return {
    type: 'mock',
    name: 'Mock Provider',
    description: 'Test provider',
    configSchema: { fields: [] },
    models: [{ id: 'mock-model', label: 'Mock Model', default: true }],
    setApiKey: vi.fn(),
    createMessage: vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'AI response' }],
      usage: { input_tokens: 100, output_tokens: 50, cost_usd: 0.001050 },
      stop_reason: 'end_turn',
    }),
    createSimpleMessage: vi.fn().mockResolvedValue('AI response'),
  }
}

export function mockModelRepo(): ModelRepository {
  return {
    listByProvider: vi.fn().mockResolvedValue([{ id: 'model-1', label: 'Model 1', is_default: true }]),
    listAll: vi.fn().mockResolvedValue([{ id: 'model-1', label: 'Model 1', is_default: true }]),
  }
}

export function mockPosterRegistry(): ConsumerPosterRegistry {
  return {
    register: vi.fn(),
    post: vi.fn().mockResolvedValue(true),
  }
}
