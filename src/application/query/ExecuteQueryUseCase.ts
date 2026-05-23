import type { WorkspaceRepository } from '../../domain/workspace/repository.js'
import type { OrganisationRepository } from '../../domain/organisation/repository.js'
import type { AuditLogRepository } from '../../domain/audit/repository.js'
import type { ProviderPlugin, registry as ProviderRegistryType } from '@supaproxy/providers'
import type { GuardrailPlugin, ExecutionRailRegistry, RetrievalRailRegistry } from '@supaproxy/guardrails'
import type { McpClientFactory, McpConnection } from '../ports/McpClient.js'
import type { ManageConversationUseCase } from '../conversation/ManageConversationUseCase.js'
import { generateId } from '../../domain/shared/EntityId.js'
import { NotFoundError, ConfigurationError } from '../../domain/shared/errors.js'
import { DEFAULT_MAX_TOOL_ROUNDS } from '../../defaults.js'
import { ERROR_CODES } from '../../prompts.js'
import type { PromptResolver } from '../prompt/PromptResolver.js'
import type { PreQueryGuardService } from './PreQueryGuardService.js'
import type { RetrieveKnowledgeForWorkspaceUseCase } from '../knowledge/RetrieveKnowledgeForWorkspaceUseCase.js'
import type { ToolCallProcessor } from './ToolCallProcessor.js'
import type { ToolEntry } from './ToolCallProcessor.js'
import { runAgentLoop, buildEmptyResult, buildQueryResult, buildAuditLogData, recordMessages, type QueryMeta, type QueryResult, type AgentLoopResult } from './AgentLoopHelpers.js'
import { resolveProvider } from './ProviderResolver.js'
import { discoverTools } from './ToolDiscovery.js'
import { screenInput } from './InputScreener.js'
import { buildSystemPrompt } from './SystemPromptBuilder.js'
import pino from 'pino'

const log = pino({ name: 'execute-query' })

export class ExecuteQueryUseCase {
  constructor(
    private readonly workspaceRepo: WorkspaceRepository,
    private readonly orgRepo: OrganisationRepository,
    private readonly auditRepo: AuditLogRepository,
    private readonly providerRegistry: typeof ProviderRegistryType,
    private readonly mcpFactory: McpClientFactory,
    private readonly conversationUseCase: ManageConversationUseCase,
    private readonly toolCallProcessor: ToolCallProcessor,
    private readonly resolveGuardrails: (workspaceId: string) => Promise<GuardrailPlugin[]> = async () => [],
    private readonly promptResolver?: PromptResolver,
    private readonly resolveExecutionRails: (workspaceId: string) => Promise<ExecutionRailRegistry | null> = async () => null,
    private readonly resolveRetrievalRails: (workspaceId: string) => Promise<RetrievalRailRegistry | null> = async () => null,
    private readonly preQueryGuard?: PreQueryGuardService,
    private readonly retrieveKnowledge?: RetrieveKnowledgeForWorkspaceUseCase,
  ) {}

  async execute(workspaceId: string, query: string, meta: QueryMeta): Promise<QueryResult> {
    const startTime = Date.now()
    const workspace = await this.workspaceRepo.findActiveById(workspaceId)
    if (!workspace) throw new NotFoundError('Workspace', workspaceId)

    const sessionId = meta.sessionId || `${meta.consumerType}:${meta.userId || 'anon'}:${workspaceId}:${Date.now()}`
    const conversationId = meta.conversationId || await this.conversationUseCase.findOrCreate(
      workspaceId, meta.consumerType, sessionId, meta.userName, meta.channel
    )

    if (meta.routedFrom) {
      await this.conversationUseCase.setRouting(conversationId, meta.routedFrom, workspace.name, '')
    }

    const ownHistory = await this.conversationUseCase.getHistory(conversationId)
    const history = [...(meta.priorHistory || []), ...ownHistory]

    let provider: ProviderPlugin
    let apiKey: string
    try {
      const resolved = await resolveProvider(this.orgRepo, this.providerRegistry, workspace.provider_type)
      provider = resolved.provider
      apiKey = resolved.apiKey
    } catch (err) {
      log.warn({ error: (err as Error).message }, 'Failed to resolve AI provider')
      return buildQueryResult({ answer: ERROR_CODES.NO_AI_PROVIDER, error: ERROR_CODES.NO_AI_PROVIDER, durationMs: Date.now() - startTime, conversationId, sessionId })
    }

    if (this.preQueryGuard) {
      const guard = await this.preQueryGuard.checkQuery(workspaceId, meta.userId, query)
      if (!guard.allowed) {
        return buildQueryResult({ answer: guard.reason || 'This query was blocked by a compliance policy.', error: guard.code || 'pre_query_blocked', durationMs: Date.now() - startTime, conversationId, sessionId })
      }
    }

    const guardrails = await this.resolveGuardrails(workspaceId)
    const screening = await screenInput(guardrails, query, { workspaceId, userId: meta.userId, consumerType: meta.consumerType })

    if (screening.blocked) {
      const auditLogId = generateId()
      await this.writeAuditLog(auditLogId, workspaceId, conversationId, query, buildEmptyResult({ error: 'input_blocked', durationMs: Date.now() - startTime }), meta, { screeningAction: screening.action, screeningCategories: screening.categories, screeningMs: screening.durationMs })
      return buildQueryResult({ answer: screening.reason!, error: 'input_blocked', durationMs: Date.now() - startTime, conversationId, sessionId })
    }

    const queryToForward = screening.queryToForward
    const executionRails = await this.resolveExecutionRails(workspaceId)
    const retrievalRails = await this.resolveRetrievalRails(workspaceId)

    let tools: ToolEntry[] = []
    let mcpConnections: McpConnection[] = []

    if (!meta.skipTools) {
      const connections = await this.workspaceRepo.findConnectionConfigs(workspaceId)
      const discovered = await discoverTools(connections, workspaceId, this.mcpFactory)
      tools = discovered.tools
      mcpConnections = discovered.mcpConnections
    }

    try {
      if (tools.length === 0) log.info({ workspace: workspaceId }, 'No tools discovered, running as direct LLM conversation')
      if (!workspace.model) throw new ConfigurationError(ERROR_CODES.NO_WORKSPACE_MODEL)

      const systemPrompt = await buildSystemPrompt(
        { workspace, systemPromptOverride: meta.systemPromptOverride, workspaceId, queryToForward },
        this.promptResolver,
        this.retrieveKnowledge,
      )

      const result = await runAgentLoop(queryToForward, provider, {
        model: workspace.model,
        systemPrompt: systemPrompt.text,
        maxToolRounds: workspace.max_tool_rounds || DEFAULT_MAX_TOOL_ROUNDS,
        tools, history, apiKey, workspaceId, conversationId, executionRails, retrievalRails,
      }, this.toolCallProcessor)

      result.durationMs = Date.now() - startTime

      const auditLogId = generateId()
      await this.writeAuditLog(auditLogId, workspaceId, conversationId, query, result, meta, { screeningAction: screening.action, screeningCategories: screening.categories, screeningMs: screening.durationMs }, systemPrompt.knowledgeChunksUsed)
      await recordMessages(this.conversationUseCase, conversationId, queryToForward, result.answer, auditLogId)

      log.info({ workspace: workspaceId, tools: result.toolsCalled.length, tokens: result.tokensInput + result.tokensOutput, cost: result.costUsd.toFixed(4), ms: result.durationMs }, 'Query complete')

      return { ...result, conversationId, sessionId, toolsCalled: result.toolsCalled.map(t => t.name) }
    } finally {
      for (const conn of mcpConnections) {
        try { await conn.close() } catch (err) { log.warn({ error: (err as Error).message }, 'Failed to close MCP connection') }
      }
    }
  }

  private async writeAuditLog(
    auditLogId: string, workspaceId: string, conversationId: string, query: string,
    result: AgentLoopResult, meta: QueryMeta,
    screening?: { screeningAction: string | null; screeningCategories: string[] | null; screeningMs: number | null },
    knowledgeChunks?: number,
  ): Promise<void> {
    try {
      const data = buildAuditLogData(auditLogId, workspaceId, conversationId, query, result, meta, screening, knowledgeChunks)
      await this.auditRepo.create(data)
    } catch (err) {
      log.error({ error: (err as Error).message }, 'Failed to write audit log')
    }
  }
}
