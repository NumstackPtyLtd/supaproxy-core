import type { WorkspaceRepository } from '../../domain/workspace/repository.js'
import type { OrganisationRepository } from '../../domain/organisation/repository.js'
import type { AuditLogRepository } from '../../domain/audit/repository.js'
import type { ProviderPlugin } from '@supaproxy/providers'
import type { registry as ProviderRegistryType } from '@supaproxy/providers'
import type { GuardrailPlugin } from '@supaproxy/guardrails'
import type { ExecutionRailRegistry } from '@supaproxy/guardrails'
import type { RetrievalRailRegistry } from '@supaproxy/guardrails'
import type { GuardrailEventRepository } from '../../domain/guardrail/repository.js'
import type { McpClientFactory, McpConnection } from '../ports/McpClient.js'
import type { ManageConversationUseCase } from '../conversation/ManageConversationUseCase.js'
import { runGuardrailChain } from '../ports/guardrailChain.js'
import { generateId } from '../../domain/shared/EntityId.js'
import { NotFoundError, ConfigurationError } from '../../domain/shared/errors.js'
import { DEFAULT_MAX_TOOL_ROUNDS, DEFAULT_SYSTEM_PROMPT } from '../../defaults.js'
import { buildScopeEnforcementClause, ERROR_CODES } from '../../prompts.js'
import type { PromptResolver } from '../prompt/PromptResolver.js'
import type { PreQueryGuardService } from './PreQueryGuardService.js'
import { RetrieveKnowledgeUseCase } from '../knowledge/RetrieveKnowledgeUseCase.js'
import type { RetrieveKnowledgeForWorkspaceUseCase } from '../knowledge/RetrieveKnowledgeForWorkspaceUseCase.js'
import { safeJsonParse } from '../../shared/json.js'
import { ToolCallProcessor } from './ToolCallProcessor.js'
import type { ToolEntry } from './ToolCallProcessor.js'
import { runAgentLoop, buildEmptyResult, buildQueryResult, buildAuditLogData, recordMessages } from './AgentLoopHelpers.js'
import type { QueryMeta, QueryResult } from './AgentLoopHelpers.js'
import pino from 'pino'

const log = pino({ name: 'execute-query' })

interface McpServerConfig {
  transport?: string
  url?: string
  headers?: Record<string, string>
  command?: string
  args?: string[]
  env?: Record<string, string>
}

export class ExecuteQueryUseCase {
  private readonly toolCallProcessor: ToolCallProcessor

  constructor(
    private readonly workspaceRepo: WorkspaceRepository,
    private readonly orgRepo: OrganisationRepository,
    private readonly auditRepo: AuditLogRepository,
    private readonly providerRegistry: typeof ProviderRegistryType,
    private readonly mcpFactory: McpClientFactory,
    private readonly conversationUseCase: ManageConversationUseCase,
    private readonly resolveGuardrails: (workspaceId: string) => Promise<GuardrailPlugin[]> = async () => [],
    private readonly promptResolver?: PromptResolver,
    private readonly resolveExecutionRails: (workspaceId: string) => Promise<ExecutionRailRegistry | null> = async () => null,
    private readonly resolveRetrievalRails: (workspaceId: string) => Promise<RetrievalRailRegistry | null> = async () => null,
    private readonly guardrailEventRepo?: GuardrailEventRepository,
    private readonly preQueryGuard?: PreQueryGuardService,
    private readonly retrieveKnowledge?: RetrieveKnowledgeForWorkspaceUseCase,
  ) {
    this.toolCallProcessor = new ToolCallProcessor(guardrailEventRepo)
  }

  async execute(workspaceId: string, query: string, meta: QueryMeta): Promise<QueryResult> {
    const startTime = Date.now()

    const workspace = await this.workspaceRepo.findActiveById(workspaceId)
    if (!workspace) throw new NotFoundError('Workspace', workspaceId)

    const sessionId = meta.sessionId || `${meta.consumerType}:${meta.userId || 'anon'}:${workspaceId}:${Date.now()}`
    const conversationId = meta.conversationId || await this.conversationUseCase.findOrCreate(
      workspaceId, meta.consumerType, sessionId, meta.userName, meta.channel
    )

    // Record routing metadata if this conversation was routed from another workspace
    if (meta.routedFrom) {
      await this.conversationUseCase.setRouting(conversationId, meta.routedFrom, workspace.name, '')
    }

    const ownHistory = await this.conversationUseCase.getHistory(conversationId)
    // Prepend prior context from routing (e.g. receptionist conversation) so the target workspace knows what was already discussed
    const history = [...(meta.priorHistory || []), ...ownHistory]

    let provider: ProviderPlugin
    let apiKey: string
    try {
      const resolved = await this.resolveProvider(workspace.provider_type)
      provider = resolved.provider
      apiKey = resolved.apiKey
    } catch (err) {
      log.warn({ error: (err as Error).message }, 'Failed to resolve AI provider')
      return buildQueryResult({
        answer: ERROR_CODES.NO_AI_PROVIDER,
        error: ERROR_CODES.NO_AI_PROVIDER,
        durationMs: Date.now() - startTime,
        conversationId,
        sessionId,
      })
    }

    // ── Pre-query enforcement (cost caps, rate limits, blocked topics) ──
    if (this.preQueryGuard) {
      const guard = await this.preQueryGuard.checkQuery(workspaceId, meta.userId, query)
      if (!guard.allowed) {
        return buildQueryResult({
          answer: guard.reason || 'This query was blocked by a compliance policy.',
          error: guard.code || 'pre_query_blocked',
          durationMs: Date.now() - startTime,
          conversationId,
          sessionId,
        })
      }
    }

    // ── Input guardrail pipeline ──
    let screeningAction: string | null = null
    let screeningCategories: string[] | null = null
    let screeningMs: number | null = null
    let knowledgeChunksUsed = 0
    let queryToForward = query

    const guardrails = await this.resolveGuardrails(workspaceId)

    if (guardrails.length > 0) {
      const screenStart = Date.now()
      const chain = await runGuardrailChain(guardrails, query, {
        workspaceId,
        userId: meta.userId,
        consumerType: meta.consumerType,
      })
      screeningMs = Date.now() - screenStart
      screeningCategories = chain.annotations.length > 0 ? chain.annotations : null

      if (chain.blocked) {
        screeningAction = 'block'
        log.info({ workspace: workspaceId, annotations: chain.annotations }, 'Query blocked by guardrail')

        const auditLogId = generateId()
        await this.writeAuditLog(auditLogId, workspaceId, conversationId, query, buildEmptyResult({ error: 'input_blocked', durationMs: Date.now() - startTime }), meta, { screeningAction, screeningCategories, screeningMs })

        return buildQueryResult({
          answer: chain.reason || 'This query was blocked by your organisation\'s input policy.',
          error: 'input_blocked',
          durationMs: Date.now() - startTime,
          conversationId,
          sessionId,
        })
      }

      if (chain.query !== query) {
        screeningAction = 'modified'
        queryToForward = chain.query
        log.info({ workspace: workspaceId, annotations: chain.annotations }, 'Query modified by guardrail')
      }
    }

    // Resolve execution and retrieval rails for this workspace
    const executionRails = await this.resolveExecutionRails(workspaceId)
    const retrievalRails = await this.resolveRetrievalRails(workspaceId)

    let tools: ToolEntry[] = []
    let mcpConnections: McpConnection[] = []

    if (!meta.skipTools) {
      const connections = await this.workspaceRepo.findConnectionConfigs(workspaceId)
      const discovered = await this.discoverTools(connections, workspaceId)
      tools = discovered.tools
      mcpConnections = discovered.mcpConnections
    }

    try {
      if (tools.length === 0) {
        log.info({ workspace: workspaceId }, 'No tools discovered, running as direct LLM conversation')
      }

      if (!workspace.model) {
        throw new ConfigurationError(ERROR_CODES.NO_WORKSPACE_MODEL)
      }

      const basePrompt = meta.systemPromptOverride || workspace.system_prompt || DEFAULT_SYSTEM_PROMPT
      let systemPrompt = basePrompt
      if (!meta.systemPromptOverride && !workspace.is_default) {
        const scopeClause = this.promptResolver
          ? await this.promptResolver.resolve('scope_enforcement', workspace.org_id || '', workspaceId)
          : buildScopeEnforcementClause()
        systemPrompt = `${basePrompt}\n\n${scopeClause}`
      }

      // Retrieve relevant knowledge and append to system prompt
      if (this.retrieveKnowledge) {
        try {
          const retrieval = await this.retrieveKnowledge.execute(workspaceId, queryToForward)
          if (retrieval.chunks.length > 0) {
            systemPrompt += RetrieveKnowledgeUseCase.formatContext(retrieval.chunks)
            knowledgeChunksUsed = retrieval.chunks.length
          }
        } catch (err) {
          log.warn({ err, workspaceId }, 'Knowledge retrieval failed, continuing without context')
        }
      }

      const result = await runAgentLoop(queryToForward, provider, {
        model: workspace.model,
        systemPrompt,
        maxToolRounds: workspace.max_tool_rounds || DEFAULT_MAX_TOOL_ROUNDS,
        tools,
        history,
        apiKey,
        workspaceId,
        conversationId,
        executionRails,
        retrievalRails,
      }, this.toolCallProcessor)

      result.durationMs = Date.now() - startTime
      // Cost is accumulated per-round from the provider's usage.cost_usd

      const auditLogId = generateId()
      await this.writeAuditLog(auditLogId, workspaceId, conversationId, query, result, meta, { screeningAction, screeningCategories, screeningMs }, knowledgeChunksUsed)
      await recordMessages(this.conversationUseCase, conversationId, queryToForward, result.answer, auditLogId)

      log.info({
        workspace: workspaceId,
        tools: result.toolsCalled.length,
        tokens: result.tokensInput + result.tokensOutput,
        cost: result.costUsd.toFixed(4),
        ms: result.durationMs,
      }, 'Query complete')

      return {
        ...result,
        conversationId,
        sessionId,
        toolsCalled: result.toolsCalled.map(t => t.name),
      }
    } finally {
      for (const conn of mcpConnections) {
        try { await conn.close() } catch (err) { log.warn({ error: (err as Error).message }, 'Failed to close MCP connection') }
      }
    }
  }

  private async resolveProvider(workspaceProviderType: string | null): Promise<{ provider: ProviderPlugin; apiKey: string }> {
    // Step 1: resolve which provider type to use (workspace override > org default)
    const orgSettings = await this.orgRepo.getSettingValues(['ai_provider_type'])
    const providerType = workspaceProviderType || orgSettings['ai_provider_type']
    if (!providerType) throw new ConfigurationError('No AI provider configured')

    // Step 2: fetch API key using prefixed key (anthropic_api_key, openai_api_key)
    // Fall back to legacy ai_api_key for backward compatibility
    const keySettings = await this.orgRepo.getSettingValues([`${providerType}_api_key`, 'ai_api_key'])
    const apiKey = keySettings[`${providerType}_api_key`] || keySettings['ai_api_key'] || null
    if (!apiKey) throw new ConfigurationError('No AI API key configured')

    const provider = this.providerRegistry.get(providerType)
    return { provider, apiKey }
  }

  private async discoverTools(
    connections: Array<{ name: string; type: string; config: string }>,
    workspaceId: string,
  ): Promise<{ tools: ToolEntry[]; mcpConnections: McpConnection[] }> {
    const tools: ToolEntry[] = []
    const mcpConnections: McpConnection[] = []

    for (const server of connections.filter(s => s.type === 'mcp')) {
      const cfg: McpServerConfig = typeof server.config === 'string' ? safeJsonParse<McpServerConfig>(server.config, {}) : server.config

      try {
        if (cfg.transport === 'http' && cfg.url) {
          const conn = await this.mcpFactory.connectHttp(cfg.url, cfg.headers, `supaproxy-${workspaceId}`)
          mcpConnections.push(conn)
          for (const tool of conn.tools) {
            tools.push({
              name: tool.name,
              connection: server.name,
              spec: { name: tool.name, description: tool.description || '', input_schema: tool.inputSchema || { type: 'object', properties: {} } },
              isWrite: (tool as unknown as Record<string, unknown>).is_write === true,
              callFn: (args) => conn.callTool(tool.name, args),
            })
          }
          log.info({ server: server.name, tools: conn.tools.length }, 'MCP connected (HTTP)')
        } else if (cfg.transport === 'stdio' && cfg.command) {
          const conn = await this.mcpFactory.connectStdio(cfg.command, cfg.args || [], cfg.env, `supaproxy-${workspaceId}`)
          mcpConnections.push(conn)
          for (const tool of conn.tools) {
            tools.push({
              name: tool.name,
              connection: server.name,
              spec: { name: tool.name, description: tool.description || '', input_schema: tool.inputSchema },
              isWrite: (tool as unknown as Record<string, unknown>).is_write === true,
              callFn: (args) => conn.callTool(tool.name, args),
            })
          }
          log.info({ server: server.name, tools: conn.tools.length }, 'MCP connected (STDIO)')
        }
      } catch (err) {
        log.error({ server: server.name, error: (err as Error).message }, 'MCP connection failed')
      }
    }

    return { tools, mcpConnections }
  }

  private async writeAuditLog(
    auditLogId: string,
    workspaceId: string,
    conversationId: string,
    query: string,
    result: { toolsCalled: { name: string; connection: string; args: Record<string, unknown>; duration_ms: number }[]; connectionsHit: string[]; tokensInput: number; tokensOutput: number; costUsd: number; durationMs: number; error: string | null },
    meta: QueryMeta,
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
