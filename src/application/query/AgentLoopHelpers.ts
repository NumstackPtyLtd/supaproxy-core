import type { AIMessage, AIContentBlock, ProviderPlugin } from '@supaproxy/providers'
import type { ExecutionRailRegistry, RetrievalRailRegistry } from '@supaproxy/guardrails'
import type { AuditLogData } from '../../domain/audit/repository.js'
import type { ManageConversationUseCase } from '../conversation/ManageConversationUseCase.js'
import type { ToolEntry, ToolCallRecord } from './ToolCallProcessor.js'
import type { ToolCallProcessor } from './ToolCallProcessor.js'
import { IS_PRODUCTION } from '../../config.js'
import { DEFAULT_MAX_RESPONSE_TOKENS } from '../../defaults.js'
import pino from 'pino'

const log = pino({ name: 'agent-loop' })

const NO_RESPONSE_MESSAGE = '(no response)'
const MAX_ROUNDS_MESSAGE = 'Ran out of tool-call rounds. Please simplify your question.'

export interface AgentLoopConfig {
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
}

export interface AgentLoopResult {
  answer: string
  toolsCalled: ToolCallRecord[]
  connectionsHit: string[]
  tokensInput: number
  tokensOutput: number
  costUsd: number
  durationMs: number
  error: string | null
}

export interface QueryMeta {
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

export interface QueryResult {
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

export async function runAgentLoop(
  query: string,
  provider: ProviderPlugin,
  config: AgentLoopConfig,
  toolCallProcessor: ToolCallProcessor,
): Promise<AgentLoopResult> {
  const result: AgentLoopResult = { answer: '', toolsCalled: [], connectionsHit: [], tokensInput: 0, tokensOutput: 0, costUsd: 0, durationMs: 0, error: null }

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

      const processed = await toolCallProcessor.processToolCalls(toolUses, {
        tools: config.tools,
        workspaceId: config.workspaceId,
        conversationId: config.conversationId,
        originalQuery: query,
        executionRails: config.executionRails,
        retrievalRails: config.retrievalRails,
      })

      result.toolsCalled.push(...processed.toolsCalled)
      for (const conn of processed.connectionsHit) {
        if (!result.connectionsHit.includes(conn)) result.connectionsHit.push(conn)
      }

      messages.push({ role: 'user', content: processed.toolResults })
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

export function buildEmptyResult(overrides: Partial<AgentLoopResult> = {}): AgentLoopResult {
  return { answer: '', toolsCalled: [], connectionsHit: [], tokensInput: 0, tokensOutput: 0, costUsd: 0, durationMs: 0, error: null, ...overrides }
}

export function buildQueryResult(partial: Partial<QueryResult> & { answer: string; conversationId: string; sessionId: string }): QueryResult {
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

export function buildAuditLogData(
  auditLogId: string,
  workspaceId: string,
  conversationId: string,
  query: string,
  result: { toolsCalled: ToolCallRecord[]; connectionsHit: string[]; tokensInput: number; tokensOutput: number; costUsd: number; durationMs: number; error: string | null },
  meta: QueryMeta,
  screening?: { screeningAction: string | null; screeningCategories: string[] | null; screeningMs: number | null },
  knowledgeChunks?: number,
): AuditLogData {
  return {
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
    knowledge_chunks_used: knowledgeChunks || 0,
  }
}

export async function recordMessages(
  conversationUseCase: ManageConversationUseCase,
  conversationId: string,
  query: string,
  answer: string,
  auditLogId: string,
): Promise<void> {
  try {
    await conversationUseCase.recordMessage(conversationId, 'user', query)
    await conversationUseCase.recordMessage(conversationId, 'assistant', answer, auditLogId)
  } catch (err) {
    log.error({ error: (err as Error).message }, 'Failed to record conversation messages')
  }
}
