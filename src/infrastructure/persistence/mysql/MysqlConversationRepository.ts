import type mysql from 'mysql2/promise'
import type { RowDataPacket } from 'mysql2'
import type {
  ConversationRepository, ConversationData, ConversationWithStatsData,
  MessageWithAuditData, ConversationStatsData, ConversationFilterData,
  ColdTransitionData, ConversationAggregateData,
} from '../../../domain/conversation/repository.js'
import { STATUS_OPEN, STATUS_CLOSED, STATUS_PENDING } from '../../../defaults.js'

interface ConvRow extends RowDataPacket, ConversationData {}
interface ConvWithStatsRow extends RowDataPacket, ConversationWithStatsData {}
interface MsgRow extends RowDataPacket { role: string; content: string }
interface MsgAuditRow extends RowDataPacket, MessageWithAuditData {}
interface StatsRow extends RowDataPacket, ConversationStatsData {}
interface FilterRow extends RowDataPacket { status: string | null; consumer_type: string | null; category: string | null; resolution_status: string | null }
interface ColdRow extends RowDataPacket, ColdTransitionData {}
interface IdRow extends RowDataPacket { id: string }
interface TotalRow extends RowDataPacket { total: number }
interface SeqRow extends RowDataPacket { next_seq: number }
interface AggRow extends RowDataPacket { ti: number; to2: number; cost: number; dur: number; qcount: number }
interface TimestampRow extends RowDataPacket { first_message_at: string | null; closed_at: string | null; message_count: number }
interface ModelRow extends RowDataPacket { model: string }
interface TicketRow extends RowDataPacket { open_count: number | null; cold_count: number | null; closed_today: number | null; closed_week: number | null }
interface SentimentRow extends RowDataPacket { sentiment_score: number; cnt: number }
interface CompStatsRow extends RowDataPacket { compliance_violations: string | null; conversation_id: string; created_at: string }
interface GapStatsRow extends RowDataPacket { knowledge_gaps: string | null; created_at: string }
interface GapWorkspaceRow extends RowDataPacket { knowledge_gaps: string | null; conversation_id: string; user_name: string | null; last_activity_at: string | null }
interface ViolationWorkspaceRow extends RowDataPacket { compliance_violations: string | null; conversation_id: string; user_name: string | null; last_activity_at: string | null }
interface ResRow extends RowDataPacket { resolution_status: string; cnt: number }
interface CatRow extends RowDataPacket { category: string; cnt: number }
interface ChanRow extends RowDataPacket { consumer_type: string; cnt: number }
interface CostRow extends RowDataPacket { cost_today: number; cost_week: number; cost_month: number; q_today: number; q_week: number; q_month: number }

export class MysqlConversationRepository implements ConversationRepository {
  constructor(private readonly pool: mysql.Pool) {}

  async findById(id: string): Promise<ConversationData | null> {
    const [rows] = await this.pool.execute<ConvRow[]>('SELECT * FROM conversations WHERE id = ?', [id])
    return rows[0] || null
  }

  async findLatestByThread(workspaceId: string, consumerType: string, externalThreadId: string): Promise<ConversationData | null> {
    const [rows] = await this.pool.execute<ConvRow[]>(
      `SELECT * FROM conversations WHERE workspace_id = ? AND consumer_type = ? AND external_thread_id = ? ORDER BY created_at DESC LIMIT 1`,
      [workspaceId, consumerType, externalThreadId]
    )
    return rows[0] || null
  }

  async findByExternalThreadId(externalThreadId: string, statuses: string[]): Promise<ConversationData | null> {
    const placeholders = statuses.map(() => '?').join(',')
    const [rows] = await this.pool.execute<ConvRow[]>(
      `SELECT * FROM conversations WHERE external_thread_id = ? AND status IN (${placeholders}) LIMIT 1`,
      [externalThreadId, ...statuses]
    )
    return rows[0] || null
  }

  async create(data: { id: string; workspaceId: string; consumerType: string; externalThreadId: string; userName?: string; channel?: string; parentId?: string }): Promise<void> {
    await this.pool.execute(
      `INSERT INTO conversations (id, workspace_id, consumer_type, external_thread_id, status, user_name, channel, first_message_at, last_activity_at, parent_conversation_id)
       VALUES (?, ?, ?, ?, '${STATUS_OPEN}', ?, ?, NOW(), NOW(), ?)`,
      [data.id, data.workspaceId, data.consumerType, data.externalThreadId, data.userName || null, data.channel || null, data.parentId || null]
    )
  }

  async updateStatus(id: string, status: string): Promise<void> {
    await this.pool.execute('UPDATE conversations SET status = ?, updated_at = NOW() WHERE id = ?', [status, id])
  }

  async updateRouting(id: string, routedFrom: string, routedTo: string, routeReason: string): Promise<void> {
    await this.pool.execute(
      'UPDATE conversations SET routed_from = ?, routed_to = ?, route_reason = ?, updated_at = NOW() WHERE id = ?',
      [routedFrom, routedTo, routeReason, id]
    )
  }

  async reopenFromCold(id: string): Promise<void> {
    await this.pool.execute(
      `UPDATE conversations SET status = '${STATUS_OPEN}', cold_at = NULL, updated_at = NOW() WHERE id = ?`, [id]
    )
  }

  async closeConversation(id: string): Promise<void> {
    await this.pool.execute(
      `UPDATE conversations SET status = '${STATUS_CLOSED}', closed_at = NOW(), updated_at = NOW() WHERE id = ?`, [id]
    )
  }

  async listWithStats(workspaceId: string, filters: { status?: string; category?: string; resolution?: string; consumer?: string }, limit: number, offset: number): Promise<{ rows: ConversationWithStatsData[]; total: number }> {
    let where = 'c.workspace_id = ?'
    const params: (string | number)[] = [workspaceId]
    if (filters.status) { where += ' AND c.status = ?'; params.push(filters.status) }
    if (filters.category) { where += ' AND cs.category = ?'; params.push(filters.category) }
    if (filters.resolution) { where += ' AND cs.resolution_status = ?'; params.push(filters.resolution) }
    if (filters.consumer) { where += ' AND c.consumer_type = ?'; params.push(filters.consumer) }

    const [rows] = await this.pool.execute<ConvWithStatsRow[]>(`
      SELECT c.*, cs.sentiment_score, cs.resolution_status, cs.summary, cs.total_cost_usd,
             cs.category, cs.knowledge_gaps, cs.compliance_violations, cs.fraud_indicators, cs.tools_used, cs.message_count as stats_message_count,
             cs.duration_seconds, cs.stats_status
      FROM conversations c
      LEFT JOIN conversation_stats cs ON cs.conversation_id = c.id
      WHERE ${where}
      ORDER BY c.last_activity_at DESC LIMIT ${limit} OFFSET ${offset}
    `, params)

    const [countRows] = await this.pool.execute<TotalRow[]>(`
      SELECT COUNT(*) as total FROM conversations c
      LEFT JOIN conversation_stats cs ON cs.conversation_id = c.id
      WHERE ${where}
    `, params)

    return { rows, total: countRows[0].total }
  }

  async getFilters(workspaceId: string): Promise<ConversationFilterData> {
    const [filterRows] = await this.pool.execute<FilterRow[]>(`
      SELECT DISTINCT c.status, c.consumer_type, cs.category, cs.resolution_status
      FROM conversations c
      LEFT JOIN conversation_stats cs ON cs.conversation_id = c.id
      WHERE c.workspace_id = ?
    `, [workspaceId])

    const filters: ConversationFilterData = { status: [], consumer: [], category: [], resolution: [] }
    for (const r of filterRows) {
      if (r.status && !filters.status.includes(r.status)) filters.status.push(r.status)
      if (r.consumer_type && !filters.consumer.includes(r.consumer_type)) filters.consumer.push(r.consumer_type)
      if (r.category && !filters.category.includes(r.category)) filters.category.push(r.category)
      if (r.resolution_status && !filters.resolution.includes(r.resolution_status)) filters.resolution.push(r.resolution_status)
    }
    return filters
  }

  async findMessages(conversationId: string): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
    const [rows] = await this.pool.execute<MsgRow[]>(
      'SELECT role, content FROM conversation_messages WHERE conversation_id = ? ORDER BY seq ASC', [conversationId]
    )
    return rows.map(r => ({ role: r.role as 'user' | 'assistant', content: r.content }))
  }

  async findMessagesWithAudit(conversationId: string): Promise<MessageWithAuditData[]> {
    const [rows] = await this.pool.execute<MsgAuditRow[]>(
      `SELECT cm.id, cm.role, cm.content, cm.created_at, cm.audit_log_id,
              al.tools_called, al.connections_hit, al.tokens_input, al.tokens_output,
              al.cost_usd, al.duration_ms, al.error as query_error
       FROM conversation_messages cm
       LEFT JOIN audit_logs al ON cm.audit_log_id = al.id
       WHERE cm.conversation_id = ? ORDER BY cm.seq ASC`, [conversationId]
    )
    return rows
  }

  async recordMessage(id: string, conversationId: string, role: 'user' | 'assistant', content: string, seq: number, auditLogId?: string): Promise<void> {
    await this.pool.execute(
      'INSERT INTO conversation_messages (id, conversation_id, role, content, audit_log_id, seq) VALUES (?, ?, ?, ?, ?, ?)',
      [id, conversationId, role, content, auditLogId || null, seq]
    )
  }

  async getNextSeq(conversationId: string): Promise<number> {
    const [rows] = await this.pool.execute<SeqRow[]>(
      'SELECT COALESCE(MAX(seq), 0) + 1 as next_seq FROM conversation_messages WHERE conversation_id = ?', [conversationId]
    )
    return rows[0]?.next_seq || 1
  }

  async incrementMessageCount(conversationId: string): Promise<void> {
    await this.pool.execute(
      'UPDATE conversations SET message_count = message_count + 1, last_activity_at = NOW(), updated_at = NOW() WHERE id = ?', [conversationId]
    )
  }

  async findStats(conversationId: string): Promise<ConversationStatsData | null> {
    const [rows] = await this.pool.execute<StatsRow[]>(
      'SELECT * FROM conversation_stats WHERE conversation_id = ?', [conversationId]
    )
    return rows[0] || null
  }

  async createStats(id: string, conversationId: string): Promise<void> {
    await this.pool.execute(
      `INSERT INTO conversation_stats (id, conversation_id, stats_status) VALUES (?, ?, '${STATUS_PENDING}')`,
      [id, conversationId]
    )
  }

  async updateStatsStatus(id: string, status: string): Promise<void> {
    await this.pool.execute('UPDATE conversation_stats SET stats_status = ? WHERE id = ?', [status, id])
  }

  async updateStatsComplete(id: string, data: {
    sentimentScore: number; resolutionStatus: string; complianceViolations: string; knowledgeGaps: string;
    fraudIndicators: string; toolsUsed: string; totalTokensInput: number; totalTokensOutput: number;
    totalCostUsd: number; totalDurationMs: number; messageCount: number; durationSeconds: number; summary: string; category: string
  }): Promise<void> {
    await this.pool.execute(
      `UPDATE conversation_stats SET
        sentiment_score = ?, resolution_status = ?, compliance_violations = ?, knowledge_gaps = ?,
        fraud_indicators = ?, tools_used = ?, total_tokens_input = ?, total_tokens_output = ?, total_cost_usd = ?,
        total_duration_ms = ?, message_count = ?, duration_seconds = ?, summary = ?, category = ?, stats_status = 'complete'
       WHERE id = ?`,
      [data.sentimentScore, data.resolutionStatus, data.complianceViolations, data.knowledgeGaps,
       data.fraudIndicators, data.toolsUsed, data.totalTokensInput, data.totalTokensOutput, data.totalCostUsd,
       data.totalDurationMs, data.messageCount, data.durationSeconds, data.summary, data.category, id]
    )
  }

  async getAggregateData(conversationId: string): Promise<ConversationAggregateData> {
    const [rows] = await this.pool.execute<AggRow[]>(
      `SELECT COALESCE(SUM(tokens_input), 0) as ti, COALESCE(SUM(tokens_output), 0) as to2,
              COALESCE(SUM(cost_usd), 0) as cost, COALESCE(SUM(duration_ms), 0) as dur, COUNT(*) as qcount
       FROM audit_logs WHERE conversation_id = ?`, [conversationId]
    )
    return { total_tokens_input: rows[0].ti, total_tokens_output: rows[0].to2, total_cost_usd: rows[0].cost, total_duration_ms: rows[0].dur, query_count: rows[0].qcount }
  }

  async getTimestamps(conversationId: string): Promise<{ first_message_at: string | null; closed_at: string | null; message_count: number } | null> {
    const [rows] = await this.pool.execute<TimestampRow[]>(
      'SELECT first_message_at, closed_at, message_count FROM conversations WHERE id = ?', [conversationId]
    )
    return rows[0] || null
  }

  async getWorkspaceModel(conversationId: string): Promise<string | null> {
    const [rows] = await this.pool.execute<ModelRow[]>(
      'SELECT w.model FROM workspaces w JOIN conversations c ON c.workspace_id = w.id WHERE c.id = ?', [conversationId]
    )
    return rows[0]?.model || null
  }

  async findColdTransitionCandidates(): Promise<ColdTransitionData[]> {
    const [rows] = await this.pool.execute<ColdRow[]>(
      `SELECT c.id, c.channel, c.external_thread_id, c.consumer_type
       FROM conversations c JOIN workspaces w ON c.workspace_id = w.id
       WHERE c.status = '${STATUS_OPEN}' AND c.last_activity_at < NOW() - INTERVAL w.cold_timeout_minutes MINUTE`
    )
    return rows
  }

  async batchTransitionToCold(ids: string[]): Promise<void> {
    if (ids.length === 0) return
    await this.pool.execute(
      `UPDATE conversations SET status = 'cold', cold_at = NOW(), updated_at = NOW() WHERE id IN (${ids.map(() => '?').join(',')})`, ids
    )
  }

  async findCloseTransitionCandidates(): Promise<string[]> {
    const [rows] = await this.pool.execute<IdRow[]>(
      `SELECT c.id FROM conversations c JOIN workspaces w ON c.workspace_id = w.id
       WHERE c.status = 'cold' AND c.cold_at < NOW() - INTERVAL w.close_timeout_minutes MINUTE`
    )
    return rows.map(r => r.id)
  }

  async batchTransitionToClosed(ids: string[]): Promise<void> {
    if (ids.length === 0) return
    await this.pool.execute(
      `UPDATE conversations SET status = '${STATUS_CLOSED}', closed_at = NOW(), updated_at = NOW() WHERE id IN (${ids.map(() => '?').join(',')})`, ids
    )
  }

  // Dashboard queries
  async getTicketSummary(workspaceId: string): Promise<{ open: number; cold: number; closed_today: number; closed_week: number }> {
    const [rows] = await this.pool.execute<TicketRow[]>(`
      SELECT SUM(status = '${STATUS_OPEN}') as open_count, SUM(status = 'cold') as cold_count,
        SUM(status = '${STATUS_CLOSED}' AND DATE(closed_at) = CURDATE()) as closed_today,
        SUM(status = '${STATUS_CLOSED}' AND closed_at > NOW() - INTERVAL 7 DAY) as closed_week
      FROM conversations WHERE workspace_id = ?
    `, [workspaceId])
    const t = rows[0] || {}
    return { open: Number(t.open_count) || 0, cold: Number(t.cold_count) || 0, closed_today: Number(t.closed_today) || 0, closed_week: Number(t.closed_week) || 0 }
  }

  async getSentimentDistribution(workspaceId: string): Promise<Array<{ score: number; count: number }>> {
    const [rows] = await this.pool.execute<SentimentRow[]>(`
      SELECT cs.sentiment_score, COUNT(*) as cnt FROM conversation_stats cs
      JOIN conversations c ON cs.conversation_id = c.id
      WHERE c.workspace_id = ? AND cs.stats_status = 'complete' AND cs.sentiment_score IS NOT NULL
      GROUP BY cs.sentiment_score
    `, [workspaceId])
    return rows.map(r => ({ score: r.sentiment_score, count: r.cnt }))
  }

  async getComplianceStats(workspaceId: string, limit: number): Promise<Array<{ compliance_violations: string | null; conversation_id: string; created_at: string }>> {
    const [rows] = await this.pool.execute<CompStatsRow[]>(`
      SELECT cs.compliance_violations, cs.conversation_id, cs.created_at FROM conversation_stats cs
      JOIN conversations c ON cs.conversation_id = c.id
      WHERE c.workspace_id = ? AND cs.stats_status = 'complete'
      ORDER BY cs.created_at DESC LIMIT ${limit}
    `, [workspaceId])
    return rows
  }

  async getKnowledgeGapStats(workspaceId: string, limit: number): Promise<Array<{ knowledge_gaps: string | null; created_at: string }>> {
    const [rows] = await this.pool.execute<GapStatsRow[]>(`
      SELECT cs.knowledge_gaps, cs.created_at FROM conversation_stats cs
      JOIN conversations c ON cs.conversation_id = c.id
      WHERE c.workspace_id = ? AND cs.stats_status = 'complete'
      ORDER BY cs.created_at DESC LIMIT ${limit}
    `, [workspaceId])
    return rows
  }

  async getKnowledgeGapsByWorkspace(workspaceId: string, limit: number): Promise<Array<{ knowledge_gaps: string | null; conversation_id: string; user_name: string | null; last_activity_at: string | null }>> {
    const [rows] = await this.pool.execute<GapWorkspaceRow[]>(`
      SELECT cs.knowledge_gaps, cs.conversation_id, c.user_name, c.last_activity_at FROM conversation_stats cs
      JOIN conversations c ON cs.conversation_id = c.id
      WHERE c.workspace_id = ? AND cs.stats_status = 'complete'
      ORDER BY cs.created_at DESC LIMIT ${limit}
    `, [workspaceId])
    return rows
  }

  async getComplianceViolationsByWorkspace(workspaceId: string, limit: number): Promise<Array<{ compliance_violations: string | null; conversation_id: string; user_name: string | null; last_activity_at: string | null }>> {
    const [rows] = await this.pool.execute<ViolationWorkspaceRow[]>(`
      SELECT cs.compliance_violations, cs.conversation_id, c.user_name, c.last_activity_at FROM conversation_stats cs
      JOIN conversations c ON cs.conversation_id = c.id
      WHERE c.workspace_id = ? AND cs.stats_status = 'complete'
      ORDER BY cs.created_at DESC LIMIT ${limit}
    `, [workspaceId])
    return rows
  }

  async getResolutionDistribution(workspaceId: string): Promise<Array<{ status: string; count: number }>> {
    const [rows] = await this.pool.execute<ResRow[]>(`
      SELECT cs.resolution_status, COUNT(*) as cnt FROM conversation_stats cs
      JOIN conversations c ON cs.conversation_id = c.id
      WHERE c.workspace_id = ? AND cs.stats_status = 'complete'
      GROUP BY cs.resolution_status
    `, [workspaceId])
    return rows.map(r => ({ status: r.resolution_status, count: r.cnt }))
  }

  async getCategoryDistribution(workspaceId: string): Promise<Array<{ category: string; count: number }>> {
    const [rows] = await this.pool.execute<CatRow[]>(`
      SELECT cs.category, COUNT(*) as cnt FROM conversation_stats cs
      JOIN conversations c ON cs.conversation_id = c.id
      WHERE c.workspace_id = ? AND cs.stats_status = 'complete' AND cs.category IS NOT NULL
      GROUP BY cs.category ORDER BY cnt DESC
    `, [workspaceId])
    return rows.map(r => ({ category: r.category, count: r.cnt }))
  }

  async getChannelDistribution(workspaceId: string): Promise<Array<{ consumer_type: string; count: number }>> {
    const [rows] = await this.pool.execute<ChanRow[]>(`
      SELECT consumer_type, COUNT(*) as cnt FROM conversations WHERE workspace_id = ?
      GROUP BY consumer_type ORDER BY cnt DESC
    `, [workspaceId])
    return rows.map(r => ({ consumer_type: r.consumer_type, count: r.cnt }))
  }

  async getCostAndUsage(workspaceId: string): Promise<{ cost_today: number; cost_week: number; cost_month: number; q_today: number; q_week: number; q_month: number }> {
    const [rows] = await this.pool.execute<CostRow[]>(`
      SELECT
        COALESCE(SUM(CASE WHEN created_at > NOW() - INTERVAL 1 DAY THEN cost_usd ELSE 0 END), 0) as cost_today,
        COALESCE(SUM(CASE WHEN created_at > NOW() - INTERVAL 7 DAY THEN cost_usd ELSE 0 END), 0) as cost_week,
        COALESCE(SUM(CASE WHEN MONTH(created_at) = MONTH(NOW()) THEN cost_usd ELSE 0 END), 0) as cost_month,
        SUM(CASE WHEN created_at > NOW() - INTERVAL 1 DAY THEN 1 ELSE 0 END) as q_today,
        SUM(CASE WHEN created_at > NOW() - INTERVAL 7 DAY THEN 1 ELSE 0 END) as q_week,
        SUM(CASE WHEN MONTH(created_at) = MONTH(NOW()) THEN 1 ELSE 0 END) as q_month
      FROM audit_logs WHERE workspace_id = ?
    `, [workspaceId])
    return rows[0] || { cost_today: 0, cost_week: 0, cost_month: 0, q_today: 0, q_week: 0, q_month: 0 }
  }

  async getRecentConversations(workspaceId: string, limit: number): Promise<ConversationWithStatsData[]> {
    const [rows] = await this.pool.execute<ConvWithStatsRow[]>(`
      SELECT c.*, cs.sentiment_score, cs.resolution_status, cs.total_cost_usd, cs.summary, cs.category
      FROM conversations c LEFT JOIN conversation_stats cs ON cs.conversation_id = c.id
      WHERE c.workspace_id = ? ORDER BY c.last_activity_at DESC LIMIT ${limit}
    `, [workspaceId])
    return rows
  }
}
