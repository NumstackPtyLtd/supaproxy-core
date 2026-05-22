import type { ConversationWithStatsData, ConversationFilterData } from './repository.js'

export interface ConversationQueryRepository {
  listWithStats(workspaceId: string, filters: { status?: string; category?: string; resolution?: string; consumer?: string }, limit: number, offset: number): Promise<{ rows: ConversationWithStatsData[]; total: number }>
  getFilters(workspaceId: string): Promise<ConversationFilterData>

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
