import { ConversationStatus } from './ConversationStatus.js'
import { StatsStatus } from './StatsStatus.js'

export interface ConversationData {
  id: string
  workspace_id: string
  consumer_type: string
  external_thread_id: string | null
  status: ConversationStatus
  user_id: string | null
  user_name: string | null
  channel: string | null
  message_count: number
  first_message_at: string | null
  last_activity_at: string | null
  cold_at: string | null
  closed_at: string | null
  parent_conversation_id?: string | null
  routed_from: string | null
  routed_to: string | null
  route_reason: string | null
  created_at: string
  updated_at: string
}

export interface ConversationWithStatsData extends ConversationData {
  sentiment_score: number | null
  resolution_status: string | null
  summary: string | null
  total_cost_usd: number | null
  category: string | null
  knowledge_gaps: string | null
  compliance_violations: string | null
  fraud_indicators: string | null
  tools_used: string | null
  stats_message_count: number | null
  duration_seconds: number | null
  stats_status: StatsStatus | null
}

export interface MessageData {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
  audit_log_id: string | null
}

export interface MessageWithAuditData extends MessageData {
  tools_called: string | null
  connections_hit: string | null
  tokens_input: number | null
  tokens_output: number | null
  cost_usd: number | null
  duration_ms: number | null
  query_error: string | null
}

export interface ConversationStatsData {
  id: string
  conversation_id: string
  sentiment_score: number | null
  resolution_status: string | null
  compliance_violations: string | null
  knowledge_gaps: string | null
  fraud_indicators: string | null
  tools_used: string | null
  total_tokens_input: number
  total_tokens_output: number
  total_cost_usd: number
  message_count: number
  duration_seconds: number
  summary: string | null
  category: string | null
  stats_status: StatsStatus
  created_at: string
}

export interface ConversationFilterData {
  status: string[]
  consumer: string[]
  category: string[]
  resolution: string[]
}

export interface ColdTransitionData {
  id: string
  channel: string
  external_thread_id: string
  consumer_type: string
}

export interface ConversationAggregateData {
  total_tokens_input: number
  total_tokens_output: number
  total_cost_usd: number
  total_duration_ms: number
  query_count: number
}

export interface ConversationRepository {
  findById(id: string): Promise<ConversationData | null>
  findLatestByThread(workspaceId: string, consumerType: string, externalThreadId: string): Promise<ConversationData | null>
  findByExternalThreadId(externalThreadId: string, statuses: string[]): Promise<ConversationData | null>
  create(data: { id: string; workspaceId: string; consumerType: string; externalThreadId: string; userName?: string; channel?: string; parentId?: string }): Promise<void>
  updateStatus(id: string, status: string): Promise<void>
  updateRouting(id: string, routedFrom: string, routedTo: string, routeReason: string): Promise<void>
  reopenFromCold(id: string): Promise<void>
  closeConversation(id: string): Promise<void>

  listWithStats(workspaceId: string, filters: { status?: string; category?: string; resolution?: string; consumer?: string }, limit: number, offset: number): Promise<{ rows: ConversationWithStatsData[]; total: number }>
  getFilters(workspaceId: string): Promise<ConversationFilterData>

  findMessages(conversationId: string): Promise<Array<{ role: 'user' | 'assistant'; content: string }>>
  findMessagesWithAudit(conversationId: string): Promise<MessageWithAuditData[]>
  recordMessage(id: string, conversationId: string, role: 'user' | 'assistant', content: string, seq: number, auditLogId?: string): Promise<void>
  getNextSeq(conversationId: string): Promise<number>
  incrementMessageCount(conversationId: string): Promise<void>

  findStats(conversationId: string): Promise<ConversationStatsData | null>
  createStats(id: string, conversationId: string): Promise<void>
  updateStatsStatus(id: string, status: string): Promise<void>
  updateStatsComplete(id: string, data: {
    sentimentScore: number
    resolutionStatus: string
    complianceViolations: string
    knowledgeGaps: string
    fraudIndicators: string
    toolsUsed: string
    totalTokensInput: number
    totalTokensOutput: number
    totalCostUsd: number
    totalDurationMs: number
    messageCount: number
    durationSeconds: number
    summary: string
    category: string
  }): Promise<void>

  getAggregateData(conversationId: string): Promise<ConversationAggregateData>
  getTimestamps(conversationId: string): Promise<{ first_message_at: string | null; closed_at: string | null; message_count: number } | null>
  getWorkspaceModel(conversationId: string): Promise<string | null>
  getWorkspaceProviderInfo(conversationId: string): Promise<{ model: string; provider_type: string | null } | null>

  findColdTransitionCandidates(): Promise<ColdTransitionData[]>
  batchTransitionToCold(ids: string[]): Promise<void>
  findCloseTransitionCandidates(): Promise<string[]>
  batchTransitionToClosed(ids: string[]): Promise<void>

  // Dashboard queries
  getTicketSummary(workspaceId: string): Promise<{ open: number; cold: number; closed_today: number; closed_week: number }>
  getSentimentDistribution(workspaceId: string): Promise<Array<{ score: number; count: number }>>
  getComplianceStats(workspaceId: string, limit: number): Promise<Array<{ compliance_violations: string | null; conversation_id: string; created_at: string }>>
  getKnowledgeGapStats(workspaceId: string, limit: number): Promise<Array<{ knowledge_gaps: string | null; created_at: string }>>
  getKnowledgeGapsByWorkspace(workspaceId: string, limit: number): Promise<Array<{ knowledge_gaps: string | null; conversation_id: string; user_name: string | null; last_activity_at: string | null }>>
  getComplianceViolationsByWorkspace(workspaceId: string, limit: number): Promise<Array<{ compliance_violations: string | null; conversation_id: string; user_name: string | null; last_activity_at: string | null }>>
  getResolutionDistribution(workspaceId: string): Promise<Array<{ status: string; count: number }>>
  getCategoryDistribution(workspaceId: string): Promise<Array<{ category: string; count: number }>>
  getChannelDistribution(workspaceId: string): Promise<Array<{ consumer_type: string; count: number }>>
  getCostAndUsage(workspaceId: string): Promise<{ cost_today: number; cost_week: number; cost_month: number; q_today: number; q_week: number; q_month: number }>
  getRecentConversations(workspaceId: string, limit: number): Promise<ConversationWithStatsData[]>
}
