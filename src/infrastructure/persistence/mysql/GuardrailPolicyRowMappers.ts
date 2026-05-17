import type mysql from 'mysql2/promise'
import type {
  GuardrailPolicyData,
  GuardrailPolicyOverrideData,
  PolicyComplianceRow,
  SecurityOverviewStats,
} from '../../../domain/guardrail/policyRepository.js'

export interface PolicyRow extends mysql.RowDataPacket {
  id: string
  org_id: string
  plugin_id: string
  enforcement: string
  created_at: string
  updated_at: string
}

export interface OverrideRow extends mysql.RowDataPacket {
  id: string
  policy_id: string
  workspace_id: string
  justification: string
  created_by: string
  created_at: string
}

export interface ComplianceRow extends mysql.RowDataPacket {
  workspace_id: string
  workspace_name: string
  enabled: number
  has_override: number
  is_default: number
}

export interface CountRow extends mysql.RowDataPacket {
  total: number
}

export interface EventCountRow extends mysql.RowDataPacket {
  blocked_events: number
  stripped_events: number
  flagged_events: number
}

export interface DayRow extends mysql.RowDataPacket {
  date: string
  blocked: number
  stripped: number
}

export interface TopWorkspaceRow extends mysql.RowDataPacket {
  workspace_id: string
  workspace_name: string
  event_count: number
}

export interface FlaggedRow extends mysql.RowDataPacket {
  id: string
  workspace_id: string
  workspace_name: string
  event_type: string
  plugin_id: string
  status: string
  created_at: string
}

export interface PluginRow extends mysql.RowDataPacket {
  plugin_id: string
}

export interface OverridePluginRow extends mysql.RowDataPacket {
  plugin_id: string
}

export function mapPolicyRow(r: PolicyRow): GuardrailPolicyData {
  return {
    id: r.id,
    org_id: r.org_id,
    plugin_id: r.plugin_id,
    enforcement: r.enforcement as GuardrailPolicyData['enforcement'],
    created_at: r.created_at,
    updated_at: r.updated_at,
  }
}

export function mapOverrideRow(r: OverrideRow): GuardrailPolicyOverrideData {
  return {
    id: r.id,
    policy_id: r.policy_id,
    workspace_id: r.workspace_id,
    justification: r.justification,
    created_by: r.created_by,
    created_at: r.created_at,
  }
}

export function mapComplianceRow(r: ComplianceRow): PolicyComplianceRow {
  return {
    workspace_id: r.workspace_id,
    workspace_name: r.workspace_name,
    enabled: r.enabled === 1,
    has_override: r.has_override === 1,
    is_default: r.is_default === 1,
  }
}

export function mapSecurityOverviewResults(
  eventCounts: EventCountRow[],
  dayRows: DayRow[],
  topWorkspaces: TopWorkspaceRow[],
  flaggedRows: FlaggedRow[],
  wsCountRows: CountRow[],
  compliantRows: CountRow[],
): SecurityOverviewStats {
  const ec = eventCounts[0]
  const blocked = Number(ec?.blocked_events ?? 0)
  const stripped = Number(ec?.stripped_events ?? 0)
  const flagged = Number(ec?.flagged_events ?? 0)
  const totalWs = Number(wsCountRows[0]?.total ?? 0)
  const compliantWs = Number(compliantRows[0]?.total ?? 0)

  return {
    total_events: blocked + stripped,
    blocked_events: blocked,
    stripped_events: stripped,
    flagged_events: flagged,
    events_by_day: dayRows.map(r => ({
      date: typeof r.date === 'string' ? r.date : String(r.date),
      blocked: Number(r.blocked),
      stripped: Number(r.stripped),
    })),
    top_workspaces: topWorkspaces.map(r => ({
      workspace_id: r.workspace_id,
      workspace_name: r.workspace_name,
      event_count: Number(r.event_count),
    })),
    recent_flagged: flaggedRows.map(r => ({
      id: r.id,
      workspace_id: r.workspace_id,
      workspace_name: r.workspace_name,
      event_type: r.event_type,
      plugin_id: r.plugin_id,
      status: r.status,
      created_at: r.created_at,
    })),
    compliance_score: totalWs > 0 ? Math.round((compliantWs / totalWs) * 100) : 100,
    total_workspaces: totalWs,
    compliant_workspaces: compliantWs,
  }
}
