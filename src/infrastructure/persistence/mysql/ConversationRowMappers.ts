import type { RowDataPacket } from 'mysql2'
import type {
  ConversationData, ConversationWithStatsData,
  MessageWithAuditData, ConversationStatsData, ConversationFilterData,
  ColdTransitionData, ConversationAggregateData,
} from '../../../domain/conversation/repository.js'

export interface ConvRow extends RowDataPacket, ConversationData {}
export interface ConvWithStatsRow extends RowDataPacket, ConversationWithStatsData {}
export interface MsgRow extends RowDataPacket { role: string; content: string }
export interface MsgAuditRow extends RowDataPacket, MessageWithAuditData {}
export interface StatsRow extends RowDataPacket, ConversationStatsData {}
export interface FilterRow extends RowDataPacket { status: string | null; consumer_type: string | null; category: string | null; resolution_status: string | null }
export interface ColdRow extends RowDataPacket, ColdTransitionData {}
export interface IdRow extends RowDataPacket { id: string }
export interface TotalRow extends RowDataPacket { total: number }
export interface SeqRow extends RowDataPacket { next_seq: number }
export interface AggRow extends RowDataPacket { ti: number; to2: number; cost: number; dur: number; qcount: number }
export interface TimestampRow extends RowDataPacket { first_message_at: string | null; closed_at: string | null; message_count: number }
export interface ModelRow extends RowDataPacket { model: string }
export interface ProviderInfoRow extends RowDataPacket { model: string; provider_type: string | null }
export interface TicketRow extends RowDataPacket { open_count: number | null; cold_count: number | null; closed_today: number | null; closed_week: number | null }
export interface SentimentRow extends RowDataPacket { sentiment_score: number; cnt: number }
export interface CompStatsRow extends RowDataPacket { compliance_violations: string | null; conversation_id: string; created_at: string }
export interface GapStatsRow extends RowDataPacket { knowledge_gaps: string | null; created_at: string }
export interface GapWorkspaceRow extends RowDataPacket { knowledge_gaps: string | null; conversation_id: string; user_name: string | null; last_activity_at: string | null }
export interface ViolationWorkspaceRow extends RowDataPacket { compliance_violations: string | null; conversation_id: string; user_name: string | null; last_activity_at: string | null }
export interface ResRow extends RowDataPacket { resolution_status: string; cnt: number }
export interface CatRow extends RowDataPacket { category: string; cnt: number }
export interface ChanRow extends RowDataPacket { consumer_type: string; cnt: number }
export interface CostRow extends RowDataPacket { cost_today: number; cost_week: number; cost_month: number; q_today: number; q_week: number; q_month: number }

export function mapAggregateRow(row: AggRow): ConversationAggregateData {
  return {
    total_tokens_input: row.ti,
    total_tokens_output: row.to2,
    total_cost_usd: row.cost,
    total_duration_ms: row.dur,
    query_count: row.qcount,
  }
}

export function mapTicketRow(row: TicketRow): { open: number; cold: number; closed_today: number; closed_week: number } {
  return {
    open: Number(row.open_count) || 0,
    cold: Number(row.cold_count) || 0,
    closed_today: Number(row.closed_today) || 0,
    closed_week: Number(row.closed_week) || 0,
  }
}

export function mapSentimentRow(row: SentimentRow): { score: number; count: number } {
  return { score: row.sentiment_score, count: row.cnt }
}

export function mapResolutionRow(row: ResRow): { status: string; count: number } {
  return { status: row.resolution_status, count: row.cnt }
}

export function mapCategoryRow(row: CatRow): { category: string; count: number } {
  return { category: row.category, count: row.cnt }
}

export function mapChannelRow(row: ChanRow): { consumer_type: string; count: number } {
  return { consumer_type: row.consumer_type, count: row.cnt }
}

export function mapFilterRows(rows: FilterRow[]): ConversationFilterData {
  const filters: ConversationFilterData = { status: [], consumer: [], category: [], resolution: [] }
  for (const r of rows) {
    if (r.status && !filters.status.includes(r.status)) filters.status.push(r.status)
    if (r.consumer_type && !filters.consumer.includes(r.consumer_type)) filters.consumer.push(r.consumer_type)
    if (r.category && !filters.category.includes(r.category)) filters.category.push(r.category)
    if (r.resolution_status && !filters.resolution.includes(r.resolution_status)) filters.resolution.push(r.resolution_status)
  }
  return filters
}
