import type mysql from 'mysql2/promise'
import type { RowDataPacket } from 'mysql2'
import type {
  WorkspaceData, ConnectionData, ConnectionToolData,
  ConsumerData, KnowledgeSourceData, GuardrailData, PermissionData,
  WorkspaceStatsData, WorkspaceListItemData, ActivityLogData,
  WorkspaceRoutingSummary,
} from '../../../domain/workspace/repository.js'

export interface IdRow extends RowDataPacket { id: string }
export interface CountRow extends RowDataPacket { c: number }
export interface TotalRow extends RowDataPacket { total: number }
export interface WsRow extends RowDataPacket, WorkspaceData {}
export interface WsListRow extends RowDataPacket, WorkspaceListItemData {}
export interface ConnRow extends RowDataPacket, ConnectionData {}
export interface ConnConfigRow extends RowDataPacket { name: string; type: string; config: string }
export interface ToolRow extends RowDataPacket, ConnectionToolData {}
export interface ConsumerRow extends RowDataPacket, ConsumerData {}
export interface KnowledgeRow extends RowDataPacket, KnowledgeSourceData {}
export interface GuardrailRow extends RowDataPacket, GuardrailData {}
export interface PermissionRow extends RowDataPacket, PermissionData {}
export interface StatsRow extends RowDataPacket, WorkspaceStatsData {}
export interface ActivityRow extends RowDataPacket, ActivityLogData {}
export interface BoundConsumerRow extends RowDataPacket { workspace_id: string; workspace_name: string }
export interface RoutingSummaryRow extends RowDataPacket { id: string; name: string; system_prompt: string | null; tool_names: string | null }
export interface ConsumersByTypeRow extends RowDataPacket { workspace_id: string; config: string; model: string; system_prompt: string | null; max_tool_rounds: number }

export function mapRoutingSummaryRow(row: RoutingSummaryRow): WorkspaceRoutingSummary {
  return {
    id: row.id,
    name: row.name,
    system_prompt: row.system_prompt,
    tool_names: row.tool_names ? row.tool_names.split(',') : [],
  }
}
