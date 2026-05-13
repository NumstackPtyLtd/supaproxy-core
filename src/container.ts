import type mysql from 'mysql2/promise'
import { JWT_SECRET, DASHBOARD_URL, IS_PRODUCTION, COOKIE_DOMAIN, REDIS_HOST, REDIS_PORT } from './config.js'

// Infrastructure
import { MysqlOrganisationRepository } from './infrastructure/persistence/mysql/MysqlOrganisationRepository.js'
import { MysqlWorkspaceRepository } from './infrastructure/persistence/mysql/MysqlWorkspaceRepository.js'
import { MysqlConversationRepository } from './infrastructure/persistence/mysql/MysqlConversationRepository.js'
import { MysqlAuditLogRepository } from './infrastructure/persistence/mysql/MysqlAuditLogRepository.js'
import { MysqlModelRepository } from './infrastructure/persistence/mysql/MysqlModelRepository.js'
import { BcryptPasswordService } from './infrastructure/auth/BcryptPasswordService.js'
import { JwtTokenService } from './infrastructure/auth/JwtTokenService.js'
import { registry as providerRegistry } from '@supaproxy/providers'
import { PatternGuardrail, LlmGuardrail, type GuardrailPlugin, ExecutionRailRegistry, WriteGuardRail, RetrievalRailRegistry, InjectionSanitiser } from '@supaproxy/guardrails'
import { McpClientFactoryImpl } from './infrastructure/mcp/McpClientFactoryImpl.js'
import { BullMqService } from './infrastructure/queue/BullMqService.js'
import { ConsumerIntegrationTester } from './infrastructure/auth/ConsumerIntegrationTester.js'
import { ConsumerPosterRegistryImpl } from './infrastructure/consumers/ConsumerPosterRegistryImpl.js'
import { RedisSessionStore } from './infrastructure/session/RedisSessionStore.js'
import { MysqlPromptTemplateRepository } from './infrastructure/persistence/mysql/MysqlPromptTemplateRepository.js'
import { MysqlGuardrailEventRepository } from './infrastructure/persistence/mysql/MysqlGuardrailEventRepository.js'
import { PromptResolver } from './application/prompt/PromptResolver.js'
import { SavePromptUseCase } from './application/prompt/SavePromptUseCase.js'
import { NoOpTenantService } from './infrastructure/tenant/NoOpTenantService.js'
import type { TenantService } from './application/ports/TenantService.js'
import { registry as consumerRegistry, slackPlugin, whatsappPlugin, apiPlugin, type ConsumerContext, type IncomingMessage, type Workspace } from '@supaproxy/consumers'

consumerRegistry.register(slackPlugin)
consumerRegistry.register(whatsappPlugin)
consumerRegistry.register(apiPlugin)
import pino from 'pino'

const log = pino({ name: 'container' })

// Application - Auth
import { SignupUseCase } from './application/auth/SignupUseCase.js'
import { LoginUseCase } from './application/auth/LoginUseCase.js'

// Application - Organisation
import { GetOrgUseCase } from './application/organisation/GetOrgUseCase.js'
import { UpdateOrgUseCase } from './application/organisation/UpdateOrgUseCase.js'
import { GetOrgSettingsUseCase } from './application/organisation/GetOrgSettingsUseCase.js'
import { UpdateOrgSettingUseCase } from './application/organisation/UpdateOrgSettingUseCase.js'
import { TestIntegrationUseCase } from './application/organisation/TestIntegrationUseCase.js'
import { ListOrgUsersUseCase } from './application/organisation/ListOrgUsersUseCase.js'

// Application - Workspace
import { CreateWorkspaceUseCase } from './application/workspace/CreateWorkspaceUseCase.js'
import { UpdateWorkspaceUseCase } from './application/workspace/UpdateWorkspaceUseCase.js'
import { GetWorkspaceDetailUseCase } from './application/workspace/GetWorkspaceDetailUseCase.js'
import { ListWorkspacesUseCase } from './application/workspace/ListWorkspacesUseCase.js'
import { GetWorkspaceSummaryUseCase } from './application/workspace/GetWorkspaceSummaryUseCase.js'
import { GetDashboardUseCase } from './application/workspace/GetDashboardUseCase.js'
import { GetActivityUseCase } from './application/workspace/GetActivityUseCase.js'
import { DeleteConnectionUseCase } from './application/workspace/DeleteConnectionUseCase.js'
import { GetConnectionsUseCase } from './application/workspace/GetConnectionsUseCase.js'
import { GetKnowledgeUseCase } from './application/workspace/GetKnowledgeUseCase.js'
import { GetComplianceUseCase } from './application/workspace/GetComplianceUseCase.js'
import { GetModelsUseCase } from './application/workspace/GetModelsUseCase.js'
import { GetHealthUseCase } from './application/workspace/GetHealthUseCase.js'

// Application - Conversation
import { ListConversationsUseCase } from './application/conversation/ListConversationsUseCase.js'
import { GetConversationDetailUseCase } from './application/conversation/GetConversationDetailUseCase.js'
import { CloseConversationUseCase } from './application/conversation/CloseConversationUseCase.js'
import { ManageConversationUseCase } from './application/conversation/ManageConversationUseCase.js'
import { LifecycleUseCase } from './application/conversation/LifecycleUseCase.js'

// Application - Connector
import { TestMcpConnectionUseCase } from './application/connector/TestMcpConnectionUseCase.js'
import { SaveMcpConnectionUseCase } from './application/connector/SaveMcpConnectionUseCase.js'
import { BindConsumerChannelUseCase } from './application/connector/BindConsumerChannelUseCase.js'
import { ConnectConsumerUseCase } from './application/connector/ConnectConsumerUseCase.js'

// Application - Query
import { ExecuteQueryUseCase } from './application/query/ExecuteQueryUseCase.js'

// Application - Routing
import { RouteMessageUseCase } from './application/routing/RouteMessageUseCase.js'

// Application - Queue
import { ManageQueuesUseCase } from './application/queue/ManageQueuesUseCase.js'

// Presentation
import { createRequireAuth } from './presentation/middleware/auth.js'
import { createAuthRoutes } from './presentation/routes/auth.js'
import { createOrgRoutes } from './presentation/routes/org.js'
import { createWorkspaceRoutes } from './presentation/routes/workspaces.js'
import { createConversationRoutes } from './presentation/routes/conversations.js'
import { createConnectorRoutes } from './presentation/routes/connectors.js'
import { createQueryRoutes } from './presentation/routes/query.js'
import { createQueueRoutes } from './presentation/routes/queues.js'
import { createRouteRoutes } from './presentation/routes/route.js'
import { createPromptRoutes } from './presentation/routes/prompts.js'

export function createContainer(pool: mysql.Pool, options?: { tenantService?: TenantService }) {
  // Tenant service: defaults to NoOp (single-tenant) for open-source.
  // Cloud deployment passes a multi-tenant implementation.
  const tenantService: TenantService = options?.tenantService ?? new NoOpTenantService()

  // Infrastructure singletons
  const orgRepo = new MysqlOrganisationRepository(pool)
  const workspaceRepo = new MysqlWorkspaceRepository(pool)
  const conversationRepo = new MysqlConversationRepository(pool)
  const auditRepo = new MysqlAuditLogRepository(pool)
  const modelRepo = new MysqlModelRepository(pool)
  const passwordService = new BcryptPasswordService()
  const tokenService = new JwtTokenService(JWT_SECRET)
  // Provider registry passed to use cases. They resolve the provider
  // dynamically from org settings at query time.
  const mcpFactory = new McpClientFactoryImpl()
  const queueService = new BullMqService(REDIS_HOST, REDIS_PORT)
  const integrationTester = new ConsumerIntegrationTester(consumerRegistry)
  const posterRegistry = new ConsumerPosterRegistryImpl()

  // Middleware
  const requireAuth = createRequireAuth(tokenService)

  // Application use cases
  const signupUseCase = new SignupUseCase(orgRepo, workspaceRepo, passwordService, tokenService)
  const loginUseCase = new LoginUseCase(orgRepo, passwordService, tokenService)
  const getOrgUseCase = new GetOrgUseCase(orgRepo)
  const updateOrgUseCase = new UpdateOrgUseCase(orgRepo)
  const getOrgSettingsUseCase = new GetOrgSettingsUseCase(orgRepo)
  const updateOrgSettingUseCase = new UpdateOrgSettingUseCase(orgRepo)
  const testIntegrationUseCase = new TestIntegrationUseCase(integrationTester)
  const listOrgUsersUseCase = new ListOrgUsersUseCase(orgRepo)

  const createWorkspaceUseCase = new CreateWorkspaceUseCase(workspaceRepo, orgRepo)
  const updateWorkspaceUseCase = new UpdateWorkspaceUseCase(workspaceRepo)
  const getWorkspaceDetailUseCase = new GetWorkspaceDetailUseCase(workspaceRepo)
  const listWorkspacesUseCase = new ListWorkspacesUseCase(workspaceRepo)
  const getWorkspaceSummaryUseCase = new GetWorkspaceSummaryUseCase(workspaceRepo)
  const getDashboardUseCase = new GetDashboardUseCase(conversationRepo)
  const getActivityUseCase = new GetActivityUseCase(workspaceRepo)
  const deleteConnectionUseCase = new DeleteConnectionUseCase(workspaceRepo)
  const getConnectionsUseCase = new GetConnectionsUseCase(workspaceRepo)
  const getKnowledgeUseCase = new GetKnowledgeUseCase(workspaceRepo, conversationRepo)
  const guardrailEventRepoForCompliance = new MysqlGuardrailEventRepository(pool)
  const getComplianceUseCase = new GetComplianceUseCase(workspaceRepo, conversationRepo, guardrailEventRepoForCompliance)
  const getModelsUseCase = new GetModelsUseCase(modelRepo, orgRepo)
  const getHealthUseCase = new GetHealthUseCase(orgRepo, workspaceRepo)

  const listConversationsUseCase = new ListConversationsUseCase(conversationRepo)
  const getConversationDetailUseCase = new GetConversationDetailUseCase(conversationRepo)
  const manageConversationUseCase = new ManageConversationUseCase(conversationRepo)
  const closeConversationUseCase = new CloseConversationUseCase(conversationRepo, queueService)
  const lifecycleUseCase = new LifecycleUseCase(conversationRepo, orgRepo, queueService, providerRegistry, posterRegistry)

  const testMcpConnectionUseCase = new TestMcpConnectionUseCase(mcpFactory)
  const saveMcpConnectionUseCase = new SaveMcpConnectionUseCase(workspaceRepo, mcpFactory)
  const bindConsumerChannelUseCase = new BindConsumerChannelUseCase(workspaceRepo)

  // Build consumer type handlers from plugin registry
  const consumerTypeHandlers: Record<string, import('./application/connector/ConnectConsumerUseCase.js').ConsumerTypeHandler> = {}
  for (const plugin of consumerRegistry.list()) {
    consumerTypeHandlers[plugin.type] = {
      buildConfig(credentials: Record<string, string>, channelId?: string) {
        return JSON.stringify({ ...credentials, channels: channelId ? [channelId] : [] })
      },
      async verifyCredentials(credentials: Record<string, string>) {
        const result = await plugin.validateCredentials(credentials)
        if (!result.ok) throw new Error(result.error || 'Verification failed')
      },
      async start(credentials: Record<string, string>) {
        const ctx: ConsumerContext = {
          onMessage: async (msg: IncomingMessage) => {
            const result = await executeQueryUseCase.execute(msg.channel, msg.query, {
              consumerType: msg.consumerType,
              channel: msg.channel,
              userId: msg.userId,
              userName: msg.userName,
              sessionId: msg.threadId,
            })
            return { answer: result.answer, conversationId: result.conversationId || '' }
          },
          onError: (err: Error) => log.error({ error: err.message }, 'Consumer error'),
          logger: log,
          getWorkspaceForChannel: async (channelId: string): Promise<Workspace | null> => {
            const consumers = await workspaceRepo.findConsumersByType(plugin.type)
            for (const row of consumers) {
              const cfg = typeof row.config === 'string' ? JSON.parse(row.config) : row.config
              if ((cfg.channels || []).includes(channelId)) {
                return { id: row.workspace_id, name: '' }
              }
            }
            return null
          },
        }
        await plugin.start(ctx, credentials)

        // Register poster for outbound messages if plugin supports it
        if (plugin.sendMessage) {
          const sendFn = plugin.sendMessage.bind(plugin)
          posterRegistry.register(plugin.type, async (target, text) => {
            const threadTs = target.externalThreadId?.split(':')[1]
            if (target.channel && threadTs) {
              await sendFn(target.channel, text, threadTs)
            }
          })
        }
      },
    }
  }
  const connectConsumerUseCase = new ConnectConsumerUseCase(workspaceRepo, consumerTypeHandlers)

  // Guardrails: resolved per workspace at query time.
  // Only enabled guardrails run. Config is loaded from workspace_guardrails table.
  const patternInstance = new PatternGuardrail()
  const availableGuardrails: Record<string, { instance: GuardrailPlugin; factory: () => GuardrailPlugin }> = {
    'pattern': { instance: patternInstance, factory: () => new PatternGuardrail() },
  }

  async function resolveGuardrails(workspaceId: string): Promise<GuardrailPlugin[]> {
    const configs = await workspaceRepo.findEnabledGuardrailConfigs(workspaceId)
    const plugins: GuardrailPlugin[] = []
    for (const { guardrail_id } of configs) {
      const entry = availableGuardrails[guardrail_id]
      if (entry) {
        plugins.push(entry.factory())
      }
    }
    return plugins
  }

  // Static instances for listing available guardrails (not for execution)
  const writeGuardInstance = new WriteGuardRail()
  const injectionSanitiserInstance = new InjectionSanitiser()

  function listAvailableGuardrails() {
    const pipeline = Object.entries(availableGuardrails).map(([id, { instance }]) => ({
      id,
      name: instance.name,
      description: instance.description,
      stage: instance.stage,
      configSchema: instance.configSchema,
    }))

    const execution = [writeGuardInstance].map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      stage: p.stage,
      configSchema: p.configSchema,
    }))

    const retrieval = [injectionSanitiserInstance].map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      stage: p.stage,
      configSchema: p.configSchema,
    }))

    return [...pipeline, ...execution, ...retrieval]
  }

  const promptTemplateRepo = new MysqlPromptTemplateRepository(pool)
  const promptResolver = new PromptResolver(promptTemplateRepo)

  // Execution and retrieval rails: resolved per workspace from enabled guardrails
  async function resolveExecutionRails(workspaceId: string): Promise<ExecutionRailRegistry | null> {
    const configs = await workspaceRepo.findEnabledGuardrailConfigs(workspaceId)
    const enabledIds = configs.map(c => c.guardrail_id)
    if (!enabledIds.includes('write-guard')) return null
    const reg = new ExecutionRailRegistry()
    reg.register(new WriteGuardRail())
    reg.on((event) => {
      if (!event.result.allowed) {
        log.warn({ plugin: event.pluginId, tool: event.ctx.toolName, workspace: event.ctx.workspaceId, reason: event.result.reason }, 'Tool call blocked by execution rail')
      }
    })
    return reg
  }

  async function resolveRetrievalRails(workspaceId: string): Promise<RetrievalRailRegistry | null> {
    const configs = await workspaceRepo.findEnabledGuardrailConfigs(workspaceId)
    const enabledIds = configs.map(c => c.guardrail_id)
    if (!enabledIds.includes('injection-sanitiser')) return null
    const reg = new RetrievalRailRegistry()
    reg.register(new InjectionSanitiser())
    reg.on((event) => {
      log.warn({ plugin: event.pluginId, stripped: event.result.stripped }, 'Injection attempt detected in tool output')
    })
    return reg
  }

  const guardrailEventRepo = new MysqlGuardrailEventRepository(pool)
  const executeQueryUseCase = new ExecuteQueryUseCase(workspaceRepo, orgRepo, auditRepo, providerRegistry, mcpFactory, manageConversationUseCase, resolveGuardrails, promptResolver, resolveExecutionRails, resolveRetrievalRails, guardrailEventRepo)
  const sessionStore = new RedisSessionStore(REDIS_HOST, REDIS_PORT)
  const routeMessageUseCase = new RouteMessageUseCase(workspaceRepo, orgRepo, conversationRepo, sessionStore, executeQueryUseCase, manageConversationUseCase)
  const manageQueuesUseCase = new ManageQueuesUseCase(queueService)

  // Build routes
  const authRoutes = createAuthRoutes({ signupUseCase, loginUseCase, tokenService, dashboardUrl: DASHBOARD_URL, isProduction: IS_PRODUCTION, cookieDomain: COOKIE_DOMAIN })
  const orgRoutes = createOrgRoutes({ getOrgUseCase, updateOrgUseCase, getOrgSettingsUseCase, updateOrgSettingUseCase, testIntegrationUseCase, listOrgUsersUseCase, orgRepo, requireAuth })
  const workspaceRoutes = createWorkspaceRoutes({ createWorkspaceUseCase, updateWorkspaceUseCase, getWorkspaceDetailUseCase, listWorkspacesUseCase, getWorkspaceSummaryUseCase, getDashboardUseCase, getActivityUseCase, deleteConnectionUseCase, getConnectionsUseCase, getKnowledgeUseCase, getComplianceUseCase, listAvailableGuardrails, orgRepo, workspaceRepo, tenantService, requireAuth })
  const conversationRoutes = createConversationRoutes({ listConversationsUseCase, getConversationDetailUseCase, closeConversationUseCase, workspaceRepo, tenantService, requireAuth })
  const connectorRoutes = createConnectorRoutes({ testMcpConnectionUseCase, saveMcpConnectionUseCase, bindConsumerChannelUseCase, connectConsumerUseCase, workspaceRepo, tenantService, requireAuth })
  const queryRoutes = createQueryRoutes({ executeQueryUseCase, workspaceRepo, tenantService, requireAuth })
  const queueRoutes = createQueueRoutes({ manageQueuesUseCase, queueService, requireAuth })
  const routeRoutes = createRouteRoutes({ routeMessageUseCase, requireAuth })
  const savePromptUseCase = new SavePromptUseCase(promptTemplateRepo)
  const promptRoutes = createPromptRoutes({ promptResolver, promptRepo: promptTemplateRepo, savePromptUseCase, requireAuth })

  const container = {
    // Infrastructure
    orgRepo, workspaceRepo, conversationRepo, auditRepo, modelRepo, promptTemplateRepo,
    passwordService, tokenService, providerRegistry, mcpFactory, promptResolver,
    queueService, integrationTester, posterRegistry, consumerRegistry, tenantService,
    // Middleware
    requireAuth,
    // Use cases
    signupUseCase, loginUseCase,
    getOrgUseCase, updateOrgUseCase, getOrgSettingsUseCase, updateOrgSettingUseCase, testIntegrationUseCase, listOrgUsersUseCase,
    createWorkspaceUseCase, updateWorkspaceUseCase, getWorkspaceDetailUseCase, listWorkspacesUseCase, getWorkspaceSummaryUseCase,
    getDashboardUseCase, getActivityUseCase, deleteConnectionUseCase, getConnectionsUseCase, getKnowledgeUseCase, getComplianceUseCase,
    getModelsUseCase, getHealthUseCase,
    listConversationsUseCase, getConversationDetailUseCase, closeConversationUseCase,
    manageConversationUseCase, lifecycleUseCase,
    testMcpConnectionUseCase, saveMcpConnectionUseCase, bindConsumerChannelUseCase, connectConsumerUseCase,
    executeQueryUseCase, routeMessageUseCase, manageQueuesUseCase, savePromptUseCase,
    // Routes
    authRoutes, orgRoutes, workspaceRoutes, conversationRoutes, connectorRoutes, queryRoutes, queueRoutes, routeRoutes, promptRoutes,
  }

  return container
}

export type Container = ReturnType<typeof createContainer>
