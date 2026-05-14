export type PolicyEnforcement = 'mandatory' | 'recommended' | 'off'

export interface GuardrailPolicyData {
  id: string
  org_id: string
  plugin_id: string
  enforcement: PolicyEnforcement
  created_at?: string
  updated_at?: string
}

export interface GuardrailPolicyOverrideData {
  id: string
  policy_id: string
  workspace_id: string
  justification: string
  created_by: string
  created_at?: string
}

export interface PolicyComplianceRow {
  workspace_id: string
  workspace_name: string
  enabled: boolean
  has_override: boolean
}

export interface SecurityOverviewStats {
  total_events: number
  blocked_events: number
  stripped_events: number
  flagged_events: number
  events_by_day: Array<{ date: string; blocked: number; stripped: number }>
  top_workspaces: Array<{ workspace_id: string; workspace_name: string; event_count: number }>
  recent_flagged: Array<{ id: string; workspace_id: string; workspace_name: string; event_type: string; plugin_id: string; status: string; created_at: string }>
  compliance_score: number
  total_workspaces: number
  compliant_workspaces: number
}

export interface GuardrailPolicyRepository {
  listByOrg(orgId: string): Promise<GuardrailPolicyData[]>
  findByOrgAndPlugin(orgId: string, pluginId: string): Promise<GuardrailPolicyData | null>
  upsert(data: GuardrailPolicyData): Promise<void>
  getComplianceForPolicy(policyId: string, pluginId: string, orgId: string): Promise<PolicyComplianceRow[]>
  findOverride(policyId: string, workspaceId: string): Promise<GuardrailPolicyOverrideData | null>
  createOverride(data: GuardrailPolicyOverrideData): Promise<void>
  deleteOverride(policyId: string, workspaceId: string): Promise<void>
  getOrgEventStats(orgId: string, days: number): Promise<SecurityOverviewStats>
  findMandatoryPlugins(orgId: string): Promise<string[]>
  findRecommendedPlugins(orgId: string): Promise<string[]>
  findOverridesForWorkspace(workspaceId: string): Promise<Array<{ plugin_id: string }>>
}
