import type mysql from 'mysql2/promise'
import type {
  GuardrailPolicyRepository,
  GuardrailPolicyData,
  GuardrailPolicyOverrideData,
  PolicyComplianceRow,
  SecurityOverviewStats,
} from '../../../domain/guardrail/policyRepository.js'
import { DEFAULT_SECURITY_TOP_WORKSPACES, DEFAULT_SECURITY_RECENT_EVENTS } from '../../../defaults.js'
import {
  type PolicyRow, type OverrideRow, type ComplianceRow,
  type CountRow, type EventCountRow, type DayRow,
  type TopWorkspaceRow, type FlaggedRow, type PluginRow, type OverridePluginRow,
  mapPolicyRow, mapOverrideRow, mapComplianceRow, mapSecurityOverviewResults,
} from './GuardrailPolicyRowMappers.js'

export class MysqlGuardrailPolicyRepository implements GuardrailPolicyRepository {
  constructor(private readonly pool: mysql.Pool) {}

  async listByOrg(orgId: string): Promise<GuardrailPolicyData[]> {
    const [rows] = await this.pool.execute<PolicyRow[]>(
      'SELECT * FROM guardrail_policies WHERE org_id = ? ORDER BY plugin_id',
      [orgId],
    )
    return rows.map(mapPolicyRow)
  }

  async findByOrgAndPlugin(orgId: string, pluginId: string): Promise<GuardrailPolicyData | null> {
    const [rows] = await this.pool.execute<PolicyRow[]>(
      'SELECT * FROM guardrail_policies WHERE org_id = ? AND plugin_id = ? LIMIT 1',
      [orgId, pluginId],
    )
    return rows[0] ? mapPolicyRow(rows[0]) : null
  }

  async upsert(data: GuardrailPolicyData): Promise<void> {
    await this.pool.execute(
      `INSERT INTO guardrail_policies (id, org_id, plugin_id, enforcement)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE enforcement = VALUES(enforcement)`,
      [data.id, data.org_id, data.plugin_id, data.enforcement],
    )
  }

  async getComplianceForPolicy(policyId: string, pluginId: string, orgId: string, search?: string): Promise<PolicyComplianceRow[]> {
    const conditions = [`w.org_id = ?`, `w.status != 'archived'`]
    const params: string[] = [pluginId, policyId, orgId]

    if (search) {
      conditions.push('w.name LIKE ?')
      params.push(`%${search}%`)
    }

    const [rows] = await this.pool.execute<ComplianceRow[]>(
      `SELECT
         w.id AS workspace_id,
         w.name AS workspace_name,
         CASE WHEN wg.id IS NOT NULL AND wg.enabled = 1 THEN 1 ELSE 0 END AS enabled,
         CASE WHEN gpo.id IS NOT NULL THEN 1 ELSE 0 END AS has_override,
         CASE WHEN w.is_default = 1 THEN 1 ELSE 0 END AS is_default
       FROM workspaces w
       LEFT JOIN workspace_guardrails wg ON wg.workspace_id = w.id AND wg.guardrail_id = ?
       LEFT JOIN guardrail_policy_overrides gpo ON gpo.policy_id = ? AND gpo.workspace_id = w.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY w.name`,
      params,
    )
    return rows.map(mapComplianceRow)
  }

  async findOverride(policyId: string, workspaceId: string): Promise<GuardrailPolicyOverrideData | null> {
    const [rows] = await this.pool.execute<OverrideRow[]>(
      'SELECT * FROM guardrail_policy_overrides WHERE policy_id = ? AND workspace_id = ? LIMIT 1',
      [policyId, workspaceId],
    )
    return rows[0] ? mapOverrideRow(rows[0]) : null
  }

  async createOverride(data: GuardrailPolicyOverrideData): Promise<void> {
    await this.pool.execute(
      'INSERT INTO guardrail_policy_overrides (id, policy_id, workspace_id, justification, created_by) VALUES (?, ?, ?, ?, ?)',
      [data.id, data.policy_id, data.workspace_id, data.justification, data.created_by],
    )
  }

  async deleteOverride(policyId: string, workspaceId: string): Promise<void> {
    await this.pool.execute(
      'DELETE FROM guardrail_policy_overrides WHERE policy_id = ? AND workspace_id = ?',
      [policyId, workspaceId],
    )
  }

  async getOrgEventStats(orgId: string, days: number): Promise<SecurityOverviewStats> {
    const dateCutoff = `DATE_SUB(NOW(), INTERVAL ${days} DAY)`

    const [
      [eventCounts],
      [dayRows],
      [topWorkspaces],
      [flaggedRows],
      [wsCountRows],
      [compliantRows],
    ] = await Promise.all([
      this.pool.execute<EventCountRow[]>(
        `SELECT
           SUM(CASE WHEN ge.event_type = 'execution_blocked' THEN 1 ELSE 0 END) AS blocked_events,
           SUM(CASE WHEN ge.event_type = 'retrieval_stripped' THEN 1 ELSE 0 END) AS stripped_events,
           SUM(CASE WHEN ge.status = 'flagged' THEN 1 ELSE 0 END) AS flagged_events
         FROM guardrail_events ge
         JOIN workspaces w ON w.id = ge.workspace_id
         WHERE w.org_id = ? AND ge.created_at >= ${dateCutoff}`,
        [orgId],
      ),
      this.pool.execute<DayRow[]>(
        `SELECT
           DATE(ge.created_at) AS date,
           SUM(CASE WHEN ge.event_type = 'execution_blocked' THEN 1 ELSE 0 END) AS blocked,
           SUM(CASE WHEN ge.event_type = 'retrieval_stripped' THEN 1 ELSE 0 END) AS stripped
         FROM guardrail_events ge
         JOIN workspaces w ON w.id = ge.workspace_id
         WHERE w.org_id = ? AND ge.created_at >= ${dateCutoff}
         GROUP BY DATE(ge.created_at)
         ORDER BY date`,
        [orgId],
      ),
      this.pool.execute<TopWorkspaceRow[]>(
        `SELECT ge.workspace_id, w.name AS workspace_name, COUNT(*) AS event_count
         FROM guardrail_events ge
         JOIN workspaces w ON w.id = ge.workspace_id
         WHERE w.org_id = ? AND ge.created_at >= ${dateCutoff}
         GROUP BY ge.workspace_id, w.name
         ORDER BY event_count DESC
         LIMIT ?`,
        [orgId, String(DEFAULT_SECURITY_TOP_WORKSPACES)],
      ),
      this.pool.execute<FlaggedRow[]>(
        `SELECT ge.id, ge.workspace_id, w.name AS workspace_name, ge.event_type, ge.plugin_id, ge.status, ge.created_at
         FROM guardrail_events ge
         JOIN workspaces w ON w.id = ge.workspace_id
         WHERE w.org_id = ? AND ge.status = 'flagged'
         ORDER BY ge.created_at DESC
         LIMIT ?`,
        [orgId, String(DEFAULT_SECURITY_RECENT_EVENTS)],
      ),
      this.pool.execute<CountRow[]>(
        `SELECT COUNT(*) AS total FROM workspaces WHERE org_id = ? AND status != 'archived'`,
        [orgId],
      ),
      this.pool.execute<CountRow[]>(
        `SELECT COUNT(DISTINCT w.id) AS total
         FROM workspaces w
         WHERE w.org_id = ? AND w.status != 'archived'
         AND NOT EXISTS (
           SELECT 1 FROM guardrail_policies gp
           WHERE gp.org_id = ? AND gp.enforcement = 'mandatory'
           AND NOT EXISTS (
             SELECT 1 FROM workspace_guardrails wg
             WHERE wg.workspace_id = w.id AND wg.guardrail_id = gp.plugin_id AND wg.enabled = 1
           )
         )`,
        [orgId, orgId],
      ),
    ])

    return mapSecurityOverviewResults(eventCounts, dayRows, topWorkspaces, flaggedRows, wsCountRows, compliantRows)
  }

  async findMandatoryPlugins(orgId: string): Promise<string[]> {
    const [rows] = await this.pool.execute<PluginRow[]>(
      `SELECT plugin_id FROM guardrail_policies WHERE org_id = ? AND enforcement = 'mandatory'`,
      [orgId],
    )
    return rows.map(r => r.plugin_id)
  }

  async findRecommendedPlugins(orgId: string): Promise<string[]> {
    const [rows] = await this.pool.execute<PluginRow[]>(
      `SELECT plugin_id FROM guardrail_policies WHERE org_id = ? AND enforcement = 'recommended'`,
      [orgId],
    )
    return rows.map(r => r.plugin_id)
  }

  async findOverridesForWorkspace(workspaceId: string): Promise<Array<{ plugin_id: string }>> {
    const [rows] = await this.pool.execute<OverridePluginRow[]>(
      `SELECT gp.plugin_id
       FROM guardrail_policy_overrides gpo
       JOIN guardrail_policies gp ON gp.id = gpo.policy_id
       WHERE gpo.workspace_id = ?`,
      [workspaceId],
    )
    return rows.map(r => ({ plugin_id: r.plugin_id }))
  }
}
