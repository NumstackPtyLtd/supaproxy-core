import type { WorkspaceRepository } from '../../domain/workspace/repository.js'
import type { OrganisationRepository } from '../../domain/organisation/repository.js'
import type { AuditLogRepository, AuditLogData } from '../../domain/audit/repository.js'
import type { AIToolSpec, AIMessage, AIContentBlock, ProviderPlugin } from '@supaproxy/providers'
import type { registry as ProviderRegistryType } from '@supaproxy/providers'
import type { GuardrailPlugin } from '@supaproxy/guardrails'
import type { ExecutionRailRegistry } from '@supaproxy/guardrails'
import type { RetrievalRailRegistry } from '@supaproxy/guardrails'
import type { GuardrailEventRepository, GuardrailEventData } from '../../domain/guardrail/repository.js'
import type { McpClientFactory, McpConnection } from '../ports/McpClient.js'
import type { ManageConversationUseCase } from '../conversation/ManageConversationUseCase.js'
import { runGuardrailChain } from '../ports/guardrailChain.js'
import { generateId } from '../../domain/shared/EntityId.js'
import { NotFoundError, ConfigurationError } from '../../domain/shared/errors.js'
import { IS_PRODUCTION } from '../../config.js'
import { DEFAULT_MAX_RESPONSE_TOKENS, DEFAULT_MAX_TOOL_ROUNDS, DEFAULT_SYSTEM_PROMPT } from '../../defaults.js'
import { buildScopeEnforcementClause, ERROR_CODES } from '../../prompts.js'
import type { PromptResolver } from '../prompt/PromptResolver.js'
import { safeJsonParse } from '../../shared/json.js'
import pino from 'pino'

const log = pino({ name: 'execute-query' })

const NO_RESPONSE_MESSAGE = '(no response)'
const MAX_ROUNDS_MESSAGE = 'Ran out of tool-call rounds. Please simplify your question.'


interface McpServerConfig {
  transport?: string
  url?: string
  headers?: Record<string, string>
  command?: string
  args?: string[]
  env?: Record<string, string>
}

interface ToolEntry {
  name: string
  connection: string
  spec: AIToolSpec
  isWrite: boolean
  callFn: (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text?: string }>; isError: boolean }>
}

interface ToolCallRecord {
  name: string
  connection: string
  args: Record<string, unknown>
  duration_ms: number
}

interface QueryResult {
  answer: string
  toolsCalled: string[]
  connectionsHit: string[]
  tokensInput: number
  tokensOutput: number
  costUsd: number
  durationMs: number
  error: string | null
  conversationId: string
  sessionId: string
}

interface QueryMeta {
  consumerType: string
  channel?: string
  userId?: string
  userName?: string
  conversationId?: string
  sessionId?: string
  systemPromptOverride?: string
  skipTools?: boolean
  routedFrom?: string
  routedFromConversationId?: string
  priorHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
}

export class ExecuteQueryUseCase {
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
  ) {}

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
      const resolved = await this.resolveProvider()
      provider = resolved.provider
      apiKey = resolved.apiKey
    } catch {
      return this.buildResult({
        answer: ERROR_CODES.NO_AI_PROVIDER,
        error: ERROR_CODES.NO_AI_PROVIDER,
        durationMs: Date.now() - startTime,
        conversationId,
        sessionId,
      })
    }

    // ── Input guardrail pipeline ──
    let screeningAction: string | null = null
    let screeningCategories: string[] | null = null
    let screeningMs: number | null = null
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
        await this.writeAuditLog(auditLogId, workspaceId, conversationId, query, this.buildInternalResult({ error: 'input_blocked', durationMs: Date.now() - startTime }), meta, { screeningAction, screeningCategories, screeningMs })

        return this.buildResult({
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

      const result = await this.runAgentLoop(queryToForward, provider, {
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
      })

      result.durationMs = Date.now() - startTime
      // Cost is accumulated per-round from the provider's usage.cost_usd

      const auditLogId = generateId()
      await this.writeAuditLog(auditLogId, workspaceId, conversationId, query, result, meta, { screeningAction, screeningCategories, screeningMs })
      await this.recordMessages(conversationId, queryToForward, result.answer, auditLogId)

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
        try { await conn.close() } catch { /* ignore */ }
      }
    }
  }

  private async resolveProvider(): Promise<{ provider: ProviderPlugin; apiKey: string }> {
    const settings = await this.orgRepo.getSettingValues(['ai_provider_type', 'ai_api_key', 'anthropic_api_key'])
    const providerType = settings['ai_provider_type'] || (() => { throw new Error('No AI provider configured') })()
    const apiKey = settings['ai_api_key'] || settings['anthropic_api_key'] || null
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

  private async runAgentLoop(query: string, provider: ProviderPlugin, config: {
    model: string
    systemPrompt: string
    maxToolRounds: number
    tools: ToolEntry[]
    history: Array<{ role: 'user' | 'assistant'; content: string }>
    apiKey: string
    workspaceId: string
    conversationId: string
    executionRails: ExecutionRailRegistry | null
    retrievalRails: RetrievalRailRegistry | null
  }): Promise<{ answer: string; toolsCalled: ToolCallRecord[]; connectionsHit: string[]; tokensInput: number; tokensOutput: number; costUsd: number; durationMs: number; error: string | null }> {
    const result = { answer: '', toolsCalled: [] as ToolCallRecord[], connectionsHit: [] as string[], tokensInput: 0, tokensOutput: 0, costUsd: 0, durationMs: 0, error: null as string | null }

    const messages: AIMessage[] = [
      ...config.history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user' as const, content: query },
    ]

    provider.setApiKey(config.apiKey)

    try {
      for (let round = 0; round < config.maxToolRounds; round++) {
        const toolSpecs = config.tools.map(t => t.spec)
        const response = await provider.createMessage({
          model: config.model,
          maxTokens: DEFAULT_MAX_RESPONSE_TOKENS,
          system: config.systemPrompt,
          apiKey: config.apiKey,
          tools: toolSpecs,
          messages,
        })

        result.tokensInput += response.usage.input_tokens
        result.tokensOutput += response.usage.output_tokens
        result.costUsd += response.usage.cost_usd

        const textParts: string[] = []
        const toolUses: AIContentBlock[] = []

        for (const block of response.content) {
          if (block.type === 'text' && block.text) textParts.push(block.text)
          if (block.type === 'tool_use') toolUses.push(block)
        }

        if (toolUses.length === 0) {
          result.answer = textParts.join('\n') || NO_RESPONSE_MESSAGE
          break
        }

        messages.push({ role: 'assistant', content: response.content })
        const toolResults: AIContentBlock[] = []

        for (const tu of toolUses) {
          const toolDef = config.tools.find(t => t.name === tu.name)
          const connName = toolDef?.connection || 'unknown'
          const toolStart = Date.now()

          // Execution rail: validate tool call before executing
          if (config.executionRails && toolDef) {
            const railResult = await config.executionRails.validate({
              toolName: tu.name!,
              toolArgs: tu.input as Record<string, unknown>,
              originalQuery: query,
              workspaceId: config.workspaceId,
              isWrite: toolDef.isWrite,
            })
            if (!railResult.allowed) {
              log.info({ tool: tu.name, reason: railResult.reason }, 'Tool call blocked by execution rail')
              toolResults.push({ type: 'tool_result', id: tu.id, text: `Tool call blocked: ${railResult.reason}` })
              this.writeGuardrailEvent({
                id: generateId(), workspace_id: config.workspaceId, conversation_id: config.conversationId,
                event_type: 'execution_blocked', plugin_id: 'write-guard',
                tool_name: tu.name!, tool_args: JSON.stringify(tu.input).substring(0, 500),
                connection_name: connName,
                original_query: query, reason: railResult.reason || null,
                original_content: null, stripped_content: null,
              })
              continue
            }
          }

          try {
            const callResult = await toolDef!.callFn(tu.input as Record<string, unknown>)
            let resultText = callResult.content
              .filter(c => c.type === 'text')
              .map(c => c.text || '')
              .join('\n')

            // Retrieval rail: sanitise tool output before feeding back to LLM
            if (config.retrievalRails) {
              const sanitised = await config.retrievalRails.sanitise(resultText)
              if (sanitised.stripped.length > 0) {
                this.writeGuardrailEvent({
                  id: generateId(), workspace_id: config.workspaceId, conversation_id: config.conversationId,
                  event_type: 'retrieval_stripped', plugin_id: 'injection-sanitiser',
                  tool_name: tu.name!, tool_args: null,
                  connection_name: connName,
                  original_query: query, reason: null,
                  original_content: resultText.substring(0, 1000),
                  stripped_content: sanitised.stripped.join(', ').substring(0, 500),
                })
              }
              resultText = sanitised.content
            }

            toolResults.push({ type: 'tool_result', id: tu.id, text: resultText })
            if (!result.connectionsHit.includes(connName)) result.connectionsHit.push(connName)
            result.toolsCalled.push({ name: tu.name!, connection: connName, args: tu.input as Record<string, unknown>, duration_ms: Date.now() - toolStart })
          } catch (err) {
            toolResults.push({ type: 'tool_result', id: tu.id, text: `Tool error: ${(err as Error).message}` })
          }
        }

        messages.push({ role: 'user', content: toolResults })
      }

      if (!result.answer) {
        result.answer = MAX_ROUNDS_MESSAGE
      }
    } catch (err) {
      const message = (err as Error).message
      result.error = message
      result.answer = IS_PRODUCTION
        ? "Something went wrong. Please try again or contact your administrator."
        : `Something went wrong: ${message}`
      log.error({ error: message }, 'Agent loop failed')
    }

    return result
  }

  private buildInternalResult(overrides: Partial<{ toolsCalled: ToolCallRecord[]; connectionsHit: string[]; tokensInput: number; tokensOutput: number; costUsd: number; durationMs: number; error: string | null }> = {}) {
    return { toolsCalled: [] as ToolCallRecord[], connectionsHit: [] as string[], tokensInput: 0, tokensOutput: 0, costUsd: 0, durationMs: 0, error: null as string | null, ...overrides }
  }

  private async writeAuditLog(
    auditLogId: string,
    workspaceId: string,
    conversationId: string,
    query: string,
    result: { toolsCalled: ToolCallRecord[]; connectionsHit: string[]; tokensInput: number; tokensOutput: number; costUsd: number; durationMs: number; error: string | null },
    meta: QueryMeta,
    screening?: { screeningAction: string | null; screeningCategories: string[] | null; screeningMs: number | null },
  ): Promise<void> {
    try {
      const data: AuditLogData = {
        id: auditLogId,
        workspace_id: workspaceId,
        conversation_id: conversationId,
        consumer_type: meta.consumerType,
        channel: meta.channel || null,
        user_id: meta.userId || null,
        user_name: meta.userName || null,
        query,
        tools_called: JSON.stringify(result.toolsCalled.map(t => t.name)),
        connections_hit: JSON.stringify(result.connectionsHit),
        tokens_input: result.tokensInput,
        tokens_output: result.tokensOutput,
        cost_usd: result.costUsd,
        duration_ms: result.durationMs,
        error: result.error,
        input_screening_action: screening?.screeningAction || null,
        input_screening_categories: screening?.screeningCategories ? JSON.stringify(screening.screeningCategories) : null,
        input_screening_ms: screening?.screeningMs || null,
      }
      await this.auditRepo.create(data)
    } catch (err) {
      log.error({ error: (err as Error).message }, 'Failed to write audit log')
    }
  }

  private writeGuardrailEvent(data: GuardrailEventData): void {
    if (!this.guardrailEventRepo) return
    this.guardrailEventRepo.create(data).catch(err => {
      log.error({ error: (err as Error).message }, 'Failed to write guardrail event')
    })
  }

  private async recordMessages(conversationId: string, query: string, answer: string, auditLogId: string): Promise<void> {
    try {
      await this.conversationUseCase.recordMessage(conversationId, 'user', query)
      await this.conversationUseCase.recordMessage(conversationId, 'assistant', answer, auditLogId)
    } catch (err) {
      log.error({ error: (err as Error).message }, 'Failed to record conversation messages')
    }
  }

  private buildResult(partial: Partial<QueryResult> & { answer: string; conversationId: string; sessionId: string }): QueryResult {
    return {
      toolsCalled: [],
      connectionsHit: [],
      tokensInput: 0,
      tokensOutput: 0,
      costUsd: 0,
      durationMs: 0,
      error: null,
      ...partial,
    }
  }
}
