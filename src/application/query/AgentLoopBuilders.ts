import type { AuditLogData } from '../../domain/audit/repository.js'
import type { ManageConversationUseCase } from '../conversation/ManageConversationUseCase.js'
import type { ToolCallRecord } from './ToolCallProcessor.js'
import type { AgentLoopResult, QueryMeta, QueryResult } from './AgentLoopTypes.js'
import pino from 'pino'

const log = pino({ name: 'agent-loop' })

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
