import type { DatabaseAdapter } from './application/ports/DatabaseAdapter.js'

// Infrastructure (non-MySQL)
import { registry as providerRegistry } from '@supaproxy/providers'
import { createGuardrailResolver, type PluginRegistry } from './GuardrailResolver.js'
import { McpClientFactoryImpl } from './infrastructure/mcp/McpClientFactoryImpl.js'
import type { QueueService } from './application/ports/QueueService.js'
import { ConsumerIntegrationTester } from './infrastructure/consumers/ConsumerIntegrationTester.js'
import { ConsumerPosterRegistryImpl } from './infrastructure/consumers/ConsumerPosterRegistryImpl.js'
import type { SessionStore } from './application/ports/SessionStore.js'
import type { PreQueryGuardDeps } from './application/query/PreQueryGuardService.js'
import type { VectorStore } from './application/ports/VectorStore.js'
import { IndexKnowledgeForWorkspaceUseCase } from './application/knowledge/IndexKnowledgeForWorkspaceUseCase.js'
import { RetrieveKnowledgeForWorkspaceUseCase } from './application/knowledge/RetrieveKnowledgeForWorkspaceUseCase.js'
import { ProviderEmbeddingServiceFactory } from './infrastructure/ai/EmbeddingServiceFactory.js'
import { PreQueryGuardService } from './application/query/PreQueryGuardService.js'
import { PromptResolver } from './application/prompt/PromptResolver.js'
import { SavePromptUseCase } from './application/prompt/SavePromptUseCase.js'
import { ListPromptsUseCase } from './application/prompt/ListPromptsUseCase.js'
import { GetPromptVersionsUseCase } from './application/prompt/GetPromptVersionsUseCase.js'
import { ActivatePromptUseCase } from './application/prompt/ActivatePromptUseCase.js'
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
import { TestProviderUseCase } from './application/organisation/TestProviderUseCase.js'
import { ListProviderModelsUseCase } from './application/organisation/ListProviderModelsUseCase.js'
import { ListOrgUsersUseCase } from './application/organisation/ListOrgUsersUseCase.js'
import { ListOrgConnectionsUseCase } from './application/workspace/ListOrgConnectionsUseCase.js'
import { GetConnectionToolsUseCase } from './application/workspace/GetConnectionToolsUseCase.js'
import { ReconnectConnectionUseCase } from './application/connector/ReconnectConnectionUseCase.js'

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
import { CreateKnowledgeSourceUseCase } from './application/workspace/CreateKnowledgeSourceUseCase.js'
import { DeleteKnowledgeSourceUseCase } from './application/workspace/DeleteKnowledgeSourceUseCase.js'
import { ListWorkspaceConsumersUseCase } from './application/workspace/ListWorkspaceConsumersUseCase.js'
import { ListWorkspaceGuardrailsUseCase } from './application/workspace/ListWorkspaceGuardrailsUseCase.js'
import { EnableGuardrailUseCase } from './application/workspace/EnableGuardrailUseCase.js'
import { DisableGuardrailUseCase } from './application/workspace/DisableGuardrailUseCase.js'
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
import { ToolCallProcessor } from './application/query/ToolCallProcessor.js'
import { FetchOAuthHttpClient } from './infrastructure/oauth/FetchOAuthHttpClient.js'
import { StatsGenerator } from './application/conversation/StatsGenerator.js'
import { safeJsonParse } from './shared/json.js'
import { resolveProvider } from './application/query/ProviderResolver.js'

// Application - Routing
import { RouteMessageUseCase } from './application/routing/RouteMessageUseCase.js'
import { WorkspaceMatcher } from './application/routing/WorkspaceMatcher.js'
import { ReceptionistRouter } from './application/routing/ReceptionistRouter.js'

// Application - Queue
import { ManageQueuesUseCase } from './application/queue/ManageQueuesUseCase.js'

// Application - Guardrail policies
import { ManagePoliciesUseCase } from './application/guardrail/ManagePoliciesUseCase.js'
import { GetSecurityOverviewUseCase } from './application/guardrail/GetSecurityOverviewUseCase.js'
import { CreatePolicyOverrideUseCase } from './application/guardrail/CreatePolicyOverrideUseCase.js'
import { UpdateGuardrailEventStatusUseCase } from './application/guardrail/UpdateGuardrailEventStatusUseCase.js'
import { ManageIntegrationUseCase } from './application/integration/ManageIntegrationUseCase.js'
import { ManageEntryPointUseCase } from './application/integration/ManageEntryPointUseCase.js'

// Application - OAuth
import { BuildOAuthAuthorizeUrlUseCase } from './application/oauth/BuildOAuthAuthorizeUrlUseCase.js'
import { ExchangeOAuthCodeUseCase } from './application/oauth/ExchangeOAuthCodeUseCase.js'
import { RefreshOAuthTokenUseCase } from './application/oauth/RefreshOAuthTokenUseCase.js'
import { DisconnectOAuthUseCase } from './application/oauth/DisconnectOAuthUseCase.js'
import { GetOAuthStatusUseCase } from './application/oauth/GetOAuthStatusUseCase.js'

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
import { createOAuthRoutes } from './presentation/routes/oauth.js'
import type { OAuthCredentialPort } from './application/oauth/OAuthCredentialService.js'

interface ContainerOptions {
  queueService: QueueService
  vectorStore: VectorStore
  sessionStore: SessionStore
  oauth?: { dashboardUrl: string; credentialPort: OAuthCredentialPort }
  tenantService?: TenantService
  authRoutes: Hono<Record<string, unknown>>
  requireAuth: (c: unknown, next: () => Promise<void>) => Promise<Response | void>
  guardrailRegistry: PluginRegistry
  executionCatalogue: PluginRegistry
  retrievalCatalogue: PluginRegistry
}

export function createContainer(infra: DatabaseAdapter, options: ContainerOptions) {
  const tenantService: TenantService = options.tenantService ?? new NoOpTenantService()
  const { authRoutes, requireAuth } = options

  // Infrastructure singletons (from injected database adapter)
  const { orgRepo, workspaceRepo, conversationRepo, conversationQueryRepo, auditRepo, modelRepo } = infra
  // Provider registry passed to use cases. They resolve the provider
  // dynamically from org settings at query time.
  const mcpFactory = new McpClientFactoryImpl()
  const { queueService } = options
  const integrationTester = new ConsumerIntegrationTester(consumerRegistry)
  const posterRegistry = new ConsumerPosterRegistryImpl()

  // Knowledge infrastructure
  const { knowledgeChunkRepo } = infra
  const { vectorStore } = options
  const embeddingFactory = new ProviderEmbeddingServiceFactory(orgRepo, providerRegistry)
  const retrieveKnowledge = new RetrieveKnowledgeForWorkspaceUseCase(vectorStore, workspaceRepo, embeddingFactory)
  const indexKnowledge = new IndexKnowledgeForWorkspaceUseCase(knowledgeChunkRepo, vectorStore, workspaceRepo, embeddingFactory)

  // Application use cases
  const getOrgUseCase = new GetOrgUseCase(orgRepo)
  const updateOrgUseCase = new UpdateOrgUseCase(orgRepo)
  const getOrgSettingsUseCase = new GetOrgSettingsUseCase(orgRepo)
  const updateOrgSettingUseCase = new UpdateOrgSettingUseCase(orgRepo)
  const testIntegrationUseCase = new TestIntegrationUseCase(integrationTester)
  const testProviderUseCase = new TestProviderUseCase(providerRegistry)
  const listProviderModelsUseCase = new ListProviderModelsUseCase(providerRegistry)
  const listOrgUsersUseCase = new ListOrgUsersUseCase(orgRepo)
  const listOrgConnectionsUseCase = new ListOrgConnectionsUseCase(workspaceRepo)
  const getConnectionToolsUseCase = new GetConnectionToolsUseCase(workspaceRepo)
  const reconnectConnectionUseCase = new ReconnectConnectionUseCase(workspaceRepo, mcpFactory)

  const createWorkspaceUseCase = new CreateWorkspaceUseCase(workspaceRepo, orgRepo)
  const updateWorkspaceUseCase = new UpdateWorkspaceUseCase(workspaceRepo)
  const getWorkspaceDetailUseCase = new GetWorkspaceDetailUseCase(workspaceRepo)
  const listWorkspacesUseCase = new ListWorkspacesUseCase(workspaceRepo)
  const getWorkspaceSummaryUseCase = new GetWorkspaceSummaryUseCase(workspaceRepo)
  const getDashboardUseCase = new GetDashboardUseCase(conversationQueryRepo)
  const getActivityUseCase = new GetActivityUseCase(workspaceRepo)
  const deleteConnectionUseCase = new DeleteConnectionUseCase(workspaceRepo)
  const deleteWorkspaceUseCase = new DeleteWorkspaceUseCase(workspaceRepo)
  const publishWorkspaceUseCase = new PublishWorkspaceUseCase(workspaceRepo)
  const getConnectionsUseCase = new GetConnectionsUseCase(workspaceRepo)
  const getKnowledgeUseCase = new GetKnowledgeUseCase(workspaceRepo, conversationQueryRepo, embeddingFactory)
  const createKnowledgeSourceUseCase = new CreateKnowledgeSourceUseCase(workspaceRepo, indexKnowledge)
  const deleteKnowledgeSourceUseCase = new DeleteKnowledgeSourceUseCase(workspaceRepo)
  const listWorkspaceConsumersUseCase = new ListWorkspaceConsumersUseCase(workspaceRepo)
  const { guardrailPolicyRepo, integrationRepo, entryPointRepo } = infra
  const guardrailEventRepoForCompliance = infra.guardrailEventRepo
  const getComplianceUseCase = new GetComplianceUseCase(workspaceRepo, conversationQueryRepo, guardrailEventRepoForCompliance)
  const getModelsUseCase = new GetModelsUseCase(modelRepo, orgRepo, providerRegistry)
  const getHealthUseCase = new GetHealthUseCase(orgRepo, workspaceRepo, providerRegistry)

  const listConversationsUseCase = new ListConversationsUseCase(conversationQueryRepo)
  const getConversationDetailUseCase = new GetConversationDetailUseCase(conversationRepo)
  const manageConversationUseCase = new ManageConversationUseCase(conversationRepo)
  const closeConversationUseCase = new CloseConversationUseCase(conversationRepo, queueService)
  const resolveProviderSafe = async (pt: string | null) => {
    try { return await resolveProvider(orgRepo, providerRegistry, pt) }
    catch { return null }
  }
  const statsGenerator = new StatsGenerator(conversationRepo, resolveProviderSafe)
  const lifecycleUseCase = new LifecycleUseCase(conversationRepo, orgRepo, queueService, providerRegistry, posterRegistry, statsGenerator)

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
              const cfg = typeof row.config === 'string' ? safeJsonParse<{ channels?: string[] }>(row.config, {}) : row.config
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
  const guardrails = createGuardrailResolver({ workspaceRepo, guardrailPolicyRepo, guardrailRegistry: options.guardrailRegistry, executionCatalogue: options.executionCatalogue, retrievalCatalogue: options.retrievalCatalogue })
  const { resolveGuardrails, resolveExecutionRails, resolveRetrievalRails, listAvailableGuardrails, corePluginIds } = guardrails

  const { promptTemplateRepo } = infra
  const promptResolver = new PromptResolver(promptTemplateRepo)

  const guardrailEventRepo = infra.guardrailEventRepo
  const preQueryGuardDeps: PreQueryGuardDeps = {
    getMonthlySpend: (wsId) => infra.getMonthlySpend(wsId),
    getWorkspaceGuardrailConfig: (wsId) => infra.getWorkspaceGuardrailConfig(wsId),
    getRecentQueryCount: (scope, window) => options.sessionStore.getRecentQueryCount(scope, window),
  }
  const preQueryGuard = new PreQueryGuardService(preQueryGuardDeps)
  const toolCallProcessor = new ToolCallProcessor(guardrailEventRepo)
  const executeQueryUseCase = new ExecuteQueryUseCase(workspaceRepo, orgRepo, auditRepo, providerRegistry, mcpFactory, manageConversationUseCase, toolCallProcessor, resolveGuardrails, promptResolver, resolveExecutionRails, resolveRetrievalRails, preQueryGuard, retrieveKnowledge)
  const { sessionStore } = options
  const workspaceMatcher = new WorkspaceMatcher(workspaceRepo, orgRepo, executeQueryUseCase)
  const receptionistRouter = new ReceptionistRouter(workspaceRepo, conversationRepo, sessionStore, manageConversationUseCase, workspaceMatcher)
  const routeMessageUseCase = new RouteMessageUseCase(workspaceRepo, sessionStore, executeQueryUseCase, manageConversationUseCase, workspaceMatcher, receptionistRouter)
  const manageQueuesUseCase = new ManageQueuesUseCase(queueService)

  // Guardrail event status
  const updateGuardrailEventStatusUseCase = new UpdateGuardrailEventStatusUseCase(guardrailEventRepo)

  // Workspace guardrails
  const listWorkspaceGuardrailsUseCase = new ListWorkspaceGuardrailsUseCase(workspaceRepo, guardrailPolicyRepo, listAvailableGuardrails)
  const enableGuardrailUseCase = new EnableGuardrailUseCase(workspaceRepo)
  const disableGuardrailUseCase = new DisableGuardrailUseCase(workspaceRepo)

  // Prompt use cases
  const savePromptUseCase = new SavePromptUseCase(promptTemplateRepo)
  const listPromptsUseCase = new ListPromptsUseCase(promptTemplateRepo)
  const getPromptVersionsUseCase = new GetPromptVersionsUseCase(promptTemplateRepo)
  const activatePromptUseCase = new ActivatePromptUseCase(promptTemplateRepo)

  // Build routes (auth routes injected from outside)
  const orgRoutes = createOrgRoutes({ getOrgUseCase, updateOrgUseCase, getOrgSettingsUseCase, updateOrgSettingUseCase, testIntegrationUseCase, testProviderUseCase, listProviderModelsUseCase, listOrgUsersUseCase, listOrgConnectionsUseCase, getConnectionToolsUseCase, reconnectConnectionUseCase, deleteConnectionUseCase, requireAuth })
  const workspaceRoutes = createWorkspaceRoutes({ createWorkspaceUseCase, updateWorkspaceUseCase, getWorkspaceDetailUseCase, listWorkspacesUseCase, getWorkspaceSummaryUseCase, getDashboardUseCase, getActivityUseCase, deleteConnectionUseCase, getConnectionsUseCase, getKnowledgeUseCase, createKnowledgeSourceUseCase, deleteKnowledgeSourceUseCase, getComplianceUseCase, deleteWorkspaceUseCase, publishWorkspaceUseCase, updateGuardrailEventStatusUseCase, listWorkspaceGuardrailsUseCase, enableGuardrailUseCase, disableGuardrailUseCase, listWorkspaceConsumersUseCase, orgRepo, workspaceRepo, tenantService, requireAuth })
  const conversationRoutes = createConversationRoutes({ listConversationsUseCase, getConversationDetailUseCase, closeConversationUseCase, workspaceRepo, tenantService, requireAuth })
  const connectorRoutes = createConnectorRoutes({ testMcpConnectionUseCase, saveMcpConnectionUseCase, bindConsumerChannelUseCase, connectConsumerUseCase, workspaceRepo, tenantService, requireAuth })
  const queryRoutes = createQueryRoutes({ executeQueryUseCase, workspaceRepo, tenantService, requireAuth })
  const queueRoutes = createQueueRoutes({ manageQueuesUseCase, queueService, requireAuth })
  const routeRoutes = createRouteRoutes({ routeMessageUseCase, requireAuth })
  const promptRoutes = createPromptRoutes({ promptResolver, savePromptUseCase, listPromptsUseCase, getPromptVersionsUseCase, activatePromptUseCase, requireAuth })

  // Guardrail policies
  const managePoliciesUseCase = new ManagePoliciesUseCase(guardrailPolicyRepo)
  const getSecurityOverviewUseCase = new GetSecurityOverviewUseCase(guardrailPolicyRepo)
  const createPolicyOverrideUseCase = new CreatePolicyOverrideUseCase(guardrailPolicyRepo)
  const guardrailPolicyRoutes = createGuardrailPolicyRoutes({ managePoliciesUseCase, getSecurityOverviewUseCase, createPolicyOverrideUseCase, listAvailableGuardrails, requireAuth })

  // Integrations (entry points)
  const manageIntegrationUseCase = new ManageIntegrationUseCase(integrationRepo)
  const manageEntryPointUseCase = new ManageEntryPointUseCase(integrationRepo, entryPointRepo)
  const integrationRoutes = createIntegrationRoutes({ manageIntegrationUseCase, manageEntryPointUseCase, integrationRepo, entryPointRepo, requireAuth })

  // OAuth routes (optional, only if providers are configured)
  let oauthRoutes = null
  if (options.oauth) {
    const oauthHttp = new FetchOAuthHttpClient()
    const buildOAuthAuthorizeUrlUseCase = new BuildOAuthAuthorizeUrlUseCase(orgRepo, options.oauth.credentialPort)
    const exchangeOAuthCodeUseCase = new ExchangeOAuthCodeUseCase(orgRepo, options.oauth.credentialPort, oauthHttp, options.oauth.dashboardUrl)
    const refreshOAuthTokenUseCase = new RefreshOAuthTokenUseCase(orgRepo, options.oauth.credentialPort, oauthHttp)
    const disconnectOAuthUseCase = new DisconnectOAuthUseCase(orgRepo)
    const getOAuthStatusUseCase = new GetOAuthStatusUseCase(orgRepo)
    oauthRoutes = createOAuthRoutes({ buildOAuthAuthorizeUrlUseCase, exchangeOAuthCodeUseCase, refreshOAuthTokenUseCase, disconnectOAuthUseCase, getOAuthStatusUseCase, dashboardUrl: options.oauth.dashboardUrl, requireAuth })
  }

  const container = {
    // Infrastructure
    orgRepo, workspaceRepo, conversationRepo, auditRepo, modelRepo, promptTemplateRepo,
    providerRegistry, mcpFactory, promptResolver,
    queueService, integrationTester, posterRegistry, consumerRegistry, tenantService,
    // Middleware
    requireAuth,
    // Use cases
    getOrgUseCase, updateOrgUseCase, getOrgSettingsUseCase, updateOrgSettingUseCase, testIntegrationUseCase, testProviderUseCase, listProviderModelsUseCase, listOrgUsersUseCase,
    createWorkspaceUseCase, updateWorkspaceUseCase, getWorkspaceDetailUseCase, listWorkspacesUseCase, getWorkspaceSummaryUseCase,
    getDashboardUseCase, getActivityUseCase, deleteConnectionUseCase, getConnectionsUseCase, getKnowledgeUseCase, getComplianceUseCase,
    createKnowledgeSourceUseCase, deleteKnowledgeSourceUseCase, listWorkspaceConsumersUseCase,
    // Knowledge pipeline (exposed for cloud overlay sync and reindex)
    indexKnowledge, retrieveKnowledge, vectorStore,
    listWorkspaceGuardrailsUseCase, enableGuardrailUseCase, disableGuardrailUseCase, updateGuardrailEventStatusUseCase,
    getModelsUseCase, getHealthUseCase,
    listConversationsUseCase, getConversationDetailUseCase, closeConversationUseCase,
    manageConversationUseCase, lifecycleUseCase,
    testMcpConnectionUseCase, saveMcpConnectionUseCase, bindConsumerChannelUseCase, connectConsumerUseCase,
    executeQueryUseCase, routeMessageUseCase, manageQueuesUseCase, savePromptUseCase, listPromptsUseCase, getPromptVersionsUseCase, activatePromptUseCase,
    managePoliciesUseCase, getSecurityOverviewUseCase, createPolicyOverrideUseCase,
    manageIntegrationUseCase, manageEntryPointUseCase, integrationRepo, entryPointRepo,
    // Routes
    authRoutes, orgRoutes, workspaceRoutes, conversationRoutes, connectorRoutes, queryRoutes, queueRoutes, routeRoutes, promptRoutes, guardrailPolicyRoutes, integrationRoutes, oauthRoutes,
  }

  return container
}

export type Container = ReturnType<typeof createContainer>
