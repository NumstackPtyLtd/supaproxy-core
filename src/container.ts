import type mysql from 'mysql2/promise'
import { REDIS_HOST, REDIS_PORT } from './config.js'

// Infrastructure
import { MysqlOrganisationRepository } from './infrastructure/persistence/mysql/MysqlOrganisationRepository.js'
import { MysqlWorkspaceRepository } from './infrastructure/persistence/mysql/MysqlWorkspaceRepository.js'
import { MysqlConversationRepository } from './infrastructure/persistence/mysql/MysqlConversationRepository.js'
import { MysqlAuditLogRepository } from './infrastructure/persistence/mysql/MysqlAuditLogRepository.js'
import { MysqlModelRepository } from './infrastructure/persistence/mysql/MysqlModelRepository.js'
import { registry as providerRegistry } from '@supaproxy/providers'
import { createGuardrailResolver } from './GuardrailResolver.js'
import { McpClientFactoryImpl } from './infrastructure/mcp/McpClientFactoryImpl.js'
import { BullMqService } from './infrastructure/queue/BullMqService.js'
import { ConsumerIntegrationTester } from './infrastructure/auth/ConsumerIntegrationTester.js'
import { ConsumerPosterRegistryImpl } from './infrastructure/consumers/ConsumerPosterRegistryImpl.js'
import { RedisSessionStore } from './infrastructure/session/RedisSessionStore.js'
import { MysqlPromptTemplateRepository } from './infrastructure/persistence/mysql/MysqlPromptTemplateRepository.js'
import { MysqlGuardrailEventRepository } from './infrastructure/persistence/mysql/MysqlGuardrailEventRepository.js'
import { MysqlGuardrailPolicyRepository } from './infrastructure/persistence/mysql/MysqlGuardrailPolicyRepository.js'
import { MysqlInstalledGuardrailRepository } from './infrastructure/persistence/mysql/MysqlInstalledGuardrailRepository.js'
import { MysqlIntegrationRepository } from './infrastructure/persistence/mysql/MysqlIntegrationRepository.js'
import { MysqlEntryPointRepository } from './infrastructure/persistence/mysql/MysqlEntryPointRepository.js'
import { DynamicPluginLoader } from './infrastructure/plugins/DynamicPluginLoader.js'
import { PreQueryGuardDepsImpl } from './infrastructure/guard/PreQueryGuardDepsImpl.js'
import { MysqlKnowledgeChunkRepository } from './infrastructure/persistence/mysql/MysqlKnowledgeChunkRepository.js'
import { LanceDBVectorStore } from './infrastructure/vector/LanceDBVectorStore.js'
import { ProviderEmbeddingService } from './infrastructure/ai/ProviderEmbeddingService.js'
import { IndexKnowledgeForWorkspaceUseCase } from './application/knowledge/IndexKnowledgeForWorkspaceUseCase.js'
import { RetrieveKnowledgeForWorkspaceUseCase } from './application/knowledge/RetrieveKnowledgeForWorkspaceUseCase.js'
import { ProviderEmbeddingServiceFactory } from './infrastructure/ai/EmbeddingServiceFactory.js'
import { PreQueryGuardService } from './application/query/PreQueryGuardService.js'
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
import { DeleteWorkspaceUseCase } from './application/workspace/DeleteWorkspaceUseCase.js'
import { PublishWorkspaceUseCase } from './application/workspace/PublishWorkspaceUseCase.js'
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

// Application - Guardrail policies
import { ManagePoliciesUseCase } from './application/guardrail/ManagePoliciesUseCase.js'
import { GetSecurityOverviewUseCase } from './application/guardrail/GetSecurityOverviewUseCase.js'
import { CreatePolicyOverrideUseCase } from './application/guardrail/CreatePolicyOverrideUseCase.js'
import { InstallGuardrailUseCase } from './application/guardrail/InstallGuardrailUseCase.js'
import { UninstallGuardrailUseCase } from './application/guardrail/UninstallGuardrailUseCase.js'
import { ManageIntegrationUseCase } from './application/integration/ManageIntegrationUseCase.js'
import { ManageEntryPointUseCase } from './application/integration/ManageEntryPointUseCase.js'

// Presentation
import type { Hono } from 'hono'
import { createOrgRoutes } from './presentation/routes/org.js'
import { createWorkspaceRoutes } from './presentation/routes/workspaces.js'
import { createConversationRoutes } from './presentation/routes/conversations.js'
import { createConnectorRoutes } from './presentation/routes/connectors.js'
import { createIntegrationRoutes } from './presentation/routes/integrations.js'
import { createQueryRoutes } from './presentation/routes/query.js'
import { createQueueRoutes } from './presentation/routes/queues.js'
import { createRouteRoutes } from './presentation/routes/route.js'
import { createPromptRoutes } from './presentation/routes/prompts.js'
import { createGuardrailPolicyRoutes } from './presentation/routes/guardrailPolicies.js'
import { createInstalledGuardrailRoutes } from './presentation/routes/installedGuardrails.js'

interface ContainerOptions {
  tenantService?: TenantService
  authRoutes: Hono
  requireAuth: (c: any, next: any) => Promise<any>
}

export function createContainer(pool: mysql.Pool, options: ContainerOptions) {
  const tenantService: TenantService = options.tenantService ?? new NoOpTenantService()
  const { authRoutes, requireAuth } = options

  // Infrastructure singletons
  const orgRepo = new MysqlOrganisationRepository(pool)
  const workspaceRepo = new MysqlWorkspaceRepository(pool)
  const conversationRepo = new MysqlConversationRepository(pool)
  const auditRepo = new MysqlAuditLogRepository(pool)
  const modelRepo = new MysqlModelRepository(pool)
  // Provider registry passed to use cases. They resolve the provider
  // dynamically from org settings at query time.
  const mcpFactory = new McpClientFactoryImpl()
  const queueService = new BullMqService(REDIS_HOST, REDIS_PORT)
  const integrationTester = new ConsumerIntegrationTester(consumerRegistry)
  const posterRegistry = new ConsumerPosterRegistryImpl()

  // Knowledge infrastructure
  const knowledgeChunkRepo = new MysqlKnowledgeChunkRepository(pool)
  // Vector store: LanceDB by default, swappable via the VectorStore port interface
  // Optional: defaults to local file storage for development
  const vectorStore: import('./application/ports/VectorStore.js').VectorStore = new LanceDBVectorStore(process.env.VECTOR_STORE_PATH ?? './data/vectors')
  const embeddingFactory = new ProviderEmbeddingServiceFactory(orgRepo, providerRegistry)
  const retrieveKnowledge = new RetrieveKnowledgeForWorkspaceUseCase(vectorStore, workspaceRepo, embeddingFactory)
  const indexKnowledge = new IndexKnowledgeForWorkspaceUseCase(knowledgeChunkRepo, vectorStore, workspaceRepo, embeddingFactory)

  // Application use cases
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
  const deleteWorkspaceUseCase = new DeleteWorkspaceUseCase(workspaceRepo)
  const publishWorkspaceUseCase = new PublishWorkspaceUseCase(workspaceRepo)
  const getConnectionsUseCase = new GetConnectionsUseCase(workspaceRepo)
  const getKnowledgeUseCase = new GetKnowledgeUseCase(workspaceRepo, conversationRepo, embeddingFactory)
  const guardrailPolicyRepo = new MysqlGuardrailPolicyRepository(pool)
  const integrationRepo = new MysqlIntegrationRepository(pool)
  const entryPointRepo = new MysqlEntryPointRepository(pool)
  const installedGuardrailRepo = new MysqlInstalledGuardrailRepository(pool)
  const pluginLoader = new DynamicPluginLoader()
  const guardrailEventRepoForCompliance = new MysqlGuardrailEventRepository(pool)
  const getComplianceUseCase = new GetComplianceUseCase(workspaceRepo, conversationRepo, guardrailEventRepoForCompliance)
  const getModelsUseCase = new GetModelsUseCase(modelRepo, orgRepo, providerRegistry)
  const getHealthUseCase = new GetHealthUseCase(orgRepo, workspaceRepo, providerRegistry)

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

  // Guardrails: resolved per workspace at query time from package catalogues.
  const guardrails = createGuardrailResolver({ workspaceRepo, guardrailPolicyRepo, installedGuardrailRepo })
  const { resolveGuardrails, resolveExecutionRails, resolveRetrievalRails, listAvailableGuardrails, corePluginIds } = guardrails

  const promptTemplateRepo = new MysqlPromptTemplateRepository(pool)
  const promptResolver = new PromptResolver(promptTemplateRepo)

  const guardrailEventRepo = new MysqlGuardrailEventRepository(pool)
  const preQueryGuardDeps = new PreQueryGuardDepsImpl(pool, REDIS_HOST, REDIS_PORT)
  const preQueryGuard = new PreQueryGuardService(preQueryGuardDeps)
  const executeQueryUseCase = new ExecuteQueryUseCase(workspaceRepo, orgRepo, auditRepo, providerRegistry, mcpFactory, manageConversationUseCase, resolveGuardrails, promptResolver, resolveExecutionRails, resolveRetrievalRails, guardrailEventRepo, preQueryGuard, retrieveKnowledge)
  const sessionStore = new RedisSessionStore(REDIS_HOST, REDIS_PORT)
  const routeMessageUseCase = new RouteMessageUseCase(workspaceRepo, orgRepo, conversationRepo, sessionStore, executeQueryUseCase, manageConversationUseCase)
  const manageQueuesUseCase = new ManageQueuesUseCase(queueService)

  // Build routes (auth routes injected from outside)
  const orgRoutes = createOrgRoutes({ getOrgUseCase, updateOrgUseCase, getOrgSettingsUseCase, updateOrgSettingUseCase, testIntegrationUseCase, listOrgUsersUseCase, orgRepo, requireAuth, providerRegistry })
  const workspaceRoutes = createWorkspaceRoutes({ createWorkspaceUseCase, updateWorkspaceUseCase, getWorkspaceDetailUseCase, listWorkspacesUseCase, getWorkspaceSummaryUseCase, getDashboardUseCase, getActivityUseCase, deleteConnectionUseCase, deleteWorkspaceUseCase, publishWorkspaceUseCase, getConnectionsUseCase, getKnowledgeUseCase, getComplianceUseCase, guardrailEventRepo: guardrailEventRepoForCompliance, guardrailPolicyRepo, listAvailableGuardrails, orgRepo, workspaceRepo, tenantService, requireAuth, indexKnowledgeUseCase: indexKnowledge })
  const conversationRoutes = createConversationRoutes({ listConversationsUseCase, getConversationDetailUseCase, closeConversationUseCase, workspaceRepo, tenantService, requireAuth })
  const connectorRoutes = createConnectorRoutes({ testMcpConnectionUseCase, saveMcpConnectionUseCase, bindConsumerChannelUseCase, connectConsumerUseCase, workspaceRepo, tenantService, requireAuth })
  const queryRoutes = createQueryRoutes({ executeQueryUseCase, workspaceRepo, tenantService, requireAuth })
  const queueRoutes = createQueueRoutes({ manageQueuesUseCase, queueService, requireAuth })
  const routeRoutes = createRouteRoutes({ routeMessageUseCase, requireAuth })
  const savePromptUseCase = new SavePromptUseCase(promptTemplateRepo)
  const promptRoutes = createPromptRoutes({ promptResolver, promptRepo: promptTemplateRepo, savePromptUseCase, requireAuth })

  // Guardrail policies
  const managePoliciesUseCase = new ManagePoliciesUseCase(guardrailPolicyRepo)
  const getSecurityOverviewUseCase = new GetSecurityOverviewUseCase(guardrailPolicyRepo)
  const createPolicyOverrideUseCase = new CreatePolicyOverrideUseCase(guardrailPolicyRepo)
  const guardrailPolicyRoutes = createGuardrailPolicyRoutes({ managePoliciesUseCase, getSecurityOverviewUseCase, createPolicyOverrideUseCase, listAvailableGuardrails, requireAuth })

  // Installed guardrails (marketplace)
  const manageIntegrationUseCase = new ManageIntegrationUseCase(integrationRepo)
  const manageEntryPointUseCase = new ManageEntryPointUseCase(integrationRepo, entryPointRepo)
  const installGuardrailUseCase = new InstallGuardrailUseCase(installedGuardrailRepo, pluginLoader, corePluginIds)
  const uninstallGuardrailUseCase = new UninstallGuardrailUseCase(installedGuardrailRepo, corePluginIds)
  const installedGuardrailRoutes = createInstalledGuardrailRoutes({ installGuardrailUseCase, uninstallGuardrailUseCase, installedGuardrailRepo, requireAuth })
  const integrationRoutes = createIntegrationRoutes({ manageIntegrationUseCase, manageEntryPointUseCase, integrationRepo, entryPointRepo, requireAuth })

  const container = {
    // Infrastructure
    orgRepo, workspaceRepo, conversationRepo, auditRepo, modelRepo, promptTemplateRepo,
    providerRegistry, mcpFactory, promptResolver,
    queueService, integrationTester, posterRegistry, consumerRegistry, tenantService,
    // Middleware
    requireAuth,
    // Use cases
    getOrgUseCase, updateOrgUseCase, getOrgSettingsUseCase, updateOrgSettingUseCase, testIntegrationUseCase, listOrgUsersUseCase,
    createWorkspaceUseCase, updateWorkspaceUseCase, getWorkspaceDetailUseCase, listWorkspacesUseCase, getWorkspaceSummaryUseCase,
    getDashboardUseCase, getActivityUseCase, deleteConnectionUseCase, getConnectionsUseCase, getKnowledgeUseCase, getComplianceUseCase,
    getModelsUseCase, getHealthUseCase,
    listConversationsUseCase, getConversationDetailUseCase, closeConversationUseCase,
    manageConversationUseCase, lifecycleUseCase,
    testMcpConnectionUseCase, saveMcpConnectionUseCase, bindConsumerChannelUseCase, connectConsumerUseCase,
    executeQueryUseCase, routeMessageUseCase, manageQueuesUseCase, savePromptUseCase,
    managePoliciesUseCase, getSecurityOverviewUseCase, createPolicyOverrideUseCase,
    installGuardrailUseCase, uninstallGuardrailUseCase,
    manageIntegrationUseCase, manageEntryPointUseCase, integrationRepo, entryPointRepo,
    // Routes
    authRoutes, orgRoutes, workspaceRoutes, conversationRoutes, connectorRoutes, queryRoutes, queueRoutes, routeRoutes, promptRoutes, guardrailPolicyRoutes, installedGuardrailRoutes, integrationRoutes,
  }

  return container
}

export type Container = ReturnType<typeof createContainer>
