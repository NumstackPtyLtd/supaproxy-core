import type mysql from 'mysql2/promise'
import type { RowDataPacket } from 'mysql2'
import type {
  WorkspaceRepository, WorkspaceData, ConnectionData, ConnectionToolData,
  ConsumerData, KnowledgeSourceData, GuardrailData, PermissionData,
  WorkspaceStatsData, WorkspaceListItemData, ActivityLogData,
  WorkspaceRoutingSummary,
} from '../../../domain/workspace/repository.js'

interface IdRow extends RowDataPacket { id: string }
interface CountRow extends RowDataPacket { c: number }
interface TotalRow extends RowDataPacket { total: number }
interface WsRow extends RowDataPacket, WorkspaceData {}
interface WsListRow extends RowDataPacket, WorkspaceListItemData {}
interface ConnRow extends RowDataPacket, ConnectionData {}
interface ConnConfigRow extends RowDataPacket { name: string; type: string; config: string }
interface ToolRow extends RowDataPacket, ConnectionToolData {}
interface ConsumerRow extends RowDataPacket, ConsumerData {}
interface KnowledgeRow extends RowDataPacket, KnowledgeSourceData {}
interface GuardrailRow extends RowDataPacket, GuardrailData {}
interface PermissionRow extends RowDataPacket, PermissionData {}
interface StatsRow extends RowDataPacket, WorkspaceStatsData {}
interface ActivityRow extends RowDataPacket, ActivityLogData {}
interface BoundConsumerRow extends RowDataPacket { workspace_id: string; workspace_name: string }
interface RoutingSummaryRow extends RowDataPacket { id: string; name: string; system_prompt: string | null; tool_names: string | null }
interface ConsumerRow extends RowDataPacket { workspace_id: string; config: string; model: string; system_prompt: string | null; max_tool_rounds: number }

export class MysqlWorkspaceRepository implements WorkspaceRepository {
  constructor(private readonly pool: mysql.Pool) {}

  async findById(id: string): Promise<WorkspaceData | null> {
    const [rows] = await this.pool.execute<WsRow[]>(
      'SELECT * FROM workspaces WHERE id = ?', [id]
    )
    return rows[0] || null
  }

  async findByIdWithTeam(id: string): Promise<WorkspaceData | null> {
    const [rows] = await this.pool.execute<WsRow[]>(
      'SELECT w.*, t.name as team FROM workspaces w LEFT JOIN teams t ON w.team_id = t.id WHERE w.id = ?', [id]
    )
    return rows[0] || null
  }

  async findActiveById(id: string): Promise<WorkspaceData | null> {
    const [rows] = await this.pool.execute<WsRow[]>(
      'SELECT * FROM workspaces WHERE id = ? AND status = "active"', [id]
    )
    return rows[0] || null
  }

  async existsById(id: string): Promise<boolean> {
    const [rows] = await this.pool.execute<IdRow[]>('SELECT id FROM workspaces WHERE id = ?', [id])
    return rows.length > 0
  }

  async create(workspace: { id: string; orgId: string | null; teamId: string | null; name: string; model: string; systemPrompt: string; createdBy?: string | null }): Promise<void> {
    await this.pool.execute(
      `INSERT INTO workspaces (id, org_id, team_id, name, status, model, system_prompt, max_tool_rounds, created_by)
       VALUES (?, ?, ?, ?, 'active', ?, ?, 10, ?)`,
      [workspace.id, workspace.orgId, workspace.teamId, workspace.name, workspace.model, workspace.systemPrompt, workspace.createdBy || null]
    )
  }

  async update(id: string, fields: { name?: string; model?: string; system_prompt?: string; cold_timeout_minutes?: number | null; close_timeout_minutes?: number | null }): Promise<void> {
    await this.pool.execute(
      'UPDATE workspaces SET name = COALESCE(?, name), model = COALESCE(?, model), system_prompt = COALESCE(?, system_prompt), cold_timeout_minutes = COALESCE(?, cold_timeout_minutes), close_timeout_minutes = COALESCE(?, close_timeout_minutes), updated_at = NOW() WHERE id = ?',
      [fields.name || null, fields.model || null, fields.system_prompt ?? null, fields.cold_timeout_minutes || null, fields.close_timeout_minutes || null, id]
    )
  }

  async listNonArchived(orgId: string | null): Promise<WorkspaceListItemData[]> {
    const where = orgId ? 'WHERE w.org_id = ? AND w.status != ?' : 'WHERE w.status != ?'
    const params = orgId ? [orgId, 'archived'] : ['archived']

    const [rows] = await this.pool.execute<WsListRow[]>(`
      SELECT w.id, w.name, t.name as team, w.status, w.model, w.created_at,
        (SELECT COUNT(*) FROM connections WHERE workspace_id = w.id) as connection_count,
        (SELECT COUNT(*) FROM connection_tools ct JOIN connections cn ON ct.connection_id = cn.id WHERE cn.workspace_id = w.id) as tool_count,
        (SELECT COUNT(*) FROM knowledge_sources WHERE workspace_id = w.id) as knowledge_count,
        (SELECT COUNT(*) FROM audit_logs WHERE workspace_id = w.id AND created_at > NOW() - INTERVAL 1 DAY) as queries_today,
        (SELECT COALESCE(SUM(cost_usd), 0) FROM audit_logs WHERE workspace_id = w.id AND MONTH(created_at) = MONTH(NOW()) AND YEAR(created_at) = YEAR(NOW())) as cost_mtd
      FROM workspaces w
      LEFT JOIN teams t ON w.team_id = t.id
      ${where}
      ORDER BY w.name
    `, params)
    return rows
  }

  async getSummary(id: string): Promise<WorkspaceData | null> {
    const [rows] = await this.pool.execute<WsRow[]>(
      'SELECT w.id, w.name, w.status, w.model, w.system_prompt, w.max_tool_rounds, w.cold_timeout_minutes, w.close_timeout_minutes, w.created_by, t.name as team FROM workspaces w LEFT JOIN teams t ON w.team_id = t.id WHERE w.id = ?', [id]
    )
    return rows[0] || null
  }

  async findConnections(workspaceId: string): Promise<ConnectionData[]> {
    const [rows] = await this.pool.execute<ConnRow[]>(
      'SELECT id, name, type, status, config FROM connections WHERE workspace_id = ?', [workspaceId]
    )
    return rows
  }

  async findConnectionConfigs(workspaceId: string): Promise<Array<{ name: string; type: string; config: string }>> {
    const [rows] = await this.pool.execute<ConnConfigRow[]>(
      'SELECT name, type, config FROM connections WHERE workspace_id = ?', [workspaceId]
    )
    return rows
  }

  async findConnectionByName(workspaceId: string, name: string): Promise<ConnectionData | null> {
    const [rows] = await this.pool.execute<ConnRow[]>(
      'SELECT id, name, type, status, config FROM connections WHERE workspace_id = ? AND name = ?', [workspaceId, name]
    )
    return rows[0] || null
  }

  async createConnection(id: string, workspaceId: string, name: string, type: string, config: string): Promise<void> {
    await this.pool.execute(
      'INSERT INTO connections (id, workspace_id, name, type, status, config) VALUES (?, ?, ?, ?, "disconnected", ?)',
      [id, workspaceId, name, type, config]
    )
  }

  async updateConnectionConfig(id: string, config: string): Promise<void> {
    await this.pool.execute('UPDATE connections SET config = ?, status = "disconnected" WHERE id = ?', [config, id])
  }

  async updateConnectionStatus(id: string, status: string): Promise<void> {
    await this.pool.execute('UPDATE connections SET status = ? WHERE id = ?', [status, id])
  }

  async deleteConnection(id: string): Promise<void> {
    await this.pool.execute('DELETE FROM connections WHERE id = ?', [id])
  }

  async findTools(workspaceId: string): Promise<ConnectionToolData[]> {
    const [rows] = await this.pool.execute<ToolRow[]>(`
      SELECT ct.id, ct.name, ct.description, ct.input_schema, ct.is_write, cn.name as connection_name
      FROM connection_tools ct JOIN connections cn ON ct.connection_id = cn.id WHERE cn.workspace_id = ?
    `, [workspaceId])
    return rows
  }

  async findToolsDetailed(workspaceId: string): Promise<ConnectionToolData[]> {
    const [rows] = await this.pool.execute<ToolRow[]>(`
      SELECT ct.id, ct.name, ct.description, ct.input_schema, ct.is_write, cn.name as connection_name, cn.type as connection_type
      FROM connection_tools ct JOIN connections cn ON ct.connection_id = cn.id WHERE cn.workspace_id = ?
    `, [workspaceId])
    return rows
  }

  async deleteToolsByConnection(connectionId: string): Promise<void> {
    await this.pool.execute('DELETE FROM connection_tools WHERE connection_id = ?', [connectionId])
  }

  async createTools(tools: Array<{ id: string; connectionId: string; name: string; description: string; inputSchema: string; isWrite: boolean }>): Promise<void> {
    if (tools.length === 0) return
    const values = tools.map(t => [t.id, t.connectionId, t.name, t.description, t.inputSchema, t.isWrite ? 1 : 0])
    const placeholders = values.map(() => '(?, ?, ?, ?, ?, ?)').join(', ')
    await this.pool.execute(
      `INSERT INTO connection_tools (id, connection_id, name, description, input_schema, is_write) VALUES ${placeholders}`,
      values.flat()
    )
  }

  async findConsumers(workspaceId: string): Promise<ConsumerData[]> {
    const [rows] = await this.pool.execute<ConsumerRow[]>(
      'SELECT id, type, config, status FROM consumers WHERE workspace_id = ?', [workspaceId]
    )
    return rows
  }

  async findConsumerByType(workspaceId: string, type: string): Promise<ConsumerData | null> {
    const [rows] = await this.pool.execute<ConsumerRow[]>(
      'SELECT id, type, config, status FROM consumers WHERE workspace_id = ? AND type = ?', [workspaceId, type]
    )
    return rows[0] || null
  }

  async createConsumer(id: string, workspaceId: string, type: string, config: string): Promise<void> {
    await this.pool.execute(
      'INSERT INTO consumers (id, workspace_id, type, config, status) VALUES (?, ?, ?, ?, "active")',
      [id, workspaceId, type, config]
    )
  }

  async updateConsumerConfig(id: string, config: string): Promise<void> {
    await this.pool.execute('UPDATE consumers SET config = ?, status = "active" WHERE id = ?', [config, id])
  }

  async findConsumerBoundToChannel(type: string, excludeWorkspaceId: string, channelId: string): Promise<{ workspace_id: string; workspace_name: string } | null> {
    const [rows] = await this.pool.execute<BoundConsumerRow[]>(
      `SELECT c.workspace_id, w.name as workspace_name FROM consumers c
       JOIN workspaces w ON c.workspace_id = w.id
       WHERE c.type = ? AND c.workspace_id != ? AND JSON_CONTAINS(c.config, JSON_QUOTE(?), '$.channels')`,
      [type, excludeWorkspaceId, channelId]
    )
    return rows[0] || null
  }

  async findConsumersByType(type: string): Promise<Array<{ workspace_id: string; config: string; model: string; system_prompt: string | null; max_tool_rounds: number }>> {
    const [rows] = await this.pool.execute<ConsumerRow[]>(
      'SELECT c.workspace_id, c.config, w.model, w.system_prompt, w.max_tool_rounds FROM consumers c JOIN workspaces w ON c.workspace_id = w.id WHERE c.type = ? AND w.status = "active"', [type]
    )
    return rows
  }

  async findKnowledge(workspaceId: string): Promise<KnowledgeSourceData[]> {
    const [rows] = await this.pool.execute<KnowledgeRow[]>(
      'SELECT id, type, name, config, status, chunks, last_synced_at FROM knowledge_sources WHERE workspace_id = ?', [workspaceId]
    )
    return rows
  }

  async findGuardrails(workspaceId: string): Promise<GuardrailData[]> {
    const [rows] = await this.pool.execute<GuardrailRow[]>(
      'SELECT id, rule_type, enabled, config FROM guardrails WHERE workspace_id = ?', [workspaceId]
    )
    return rows
  }

  async findEnabledGuardrailConfigs(workspaceId: string): Promise<Array<{ guardrail_id: string; config: string | null }>> {
    const [rows] = await this.pool.execute<Array<mysql.RowDataPacket & { guardrail_id: string; config: string | null }>>(
      'SELECT guardrail_id, config FROM workspace_guardrails WHERE workspace_id = ? AND enabled = TRUE', [workspaceId]
    )
    return rows.map(r => ({ guardrail_id: r.guardrail_id, config: r.config }))
  }

  async enableGuardrail(id: string, workspaceId: string, guardrailId: string, config?: string): Promise<void> {
    await this.pool.execute(
      `INSERT INTO workspace_guardrails (id, workspace_id, guardrail_id, enabled, config)
       VALUES (?, ?, ?, TRUE, ?)
       ON DUPLICATE KEY UPDATE enabled = TRUE, config = VALUES(config)`,
      [id, workspaceId, guardrailId, config || null]
    )
  }

  async disableGuardrail(workspaceId: string, guardrailId: string): Promise<void> {
    await this.pool.execute(
      'UPDATE workspace_guardrails SET enabled = FALSE WHERE workspace_id = ? AND guardrail_id = ?',
      [workspaceId, guardrailId]
    )
  }

  async findPermissions(workspaceId: string): Promise<PermissionData[]> {
    const [rows] = await this.pool.execute<PermissionRow[]>(
      'SELECT role, tool_patterns FROM permissions WHERE workspace_id = ?', [workspaceId]
    )
    return rows
  }

  async getStats(workspaceId: string): Promise<WorkspaceStatsData> {
    const [rows] = await this.pool.execute<StatsRow[]>(`
      SELECT
        (SELECT COUNT(*) FROM audit_logs WHERE workspace_id = ? AND created_at > NOW() - INTERVAL 1 DAY) as today,
        (SELECT COUNT(*) FROM audit_logs WHERE workspace_id = ? AND created_at > NOW() - INTERVAL 7 DAY) as week,
        (SELECT COUNT(*) FROM audit_logs WHERE workspace_id = ? AND MONTH(created_at) = MONTH(NOW())) as month,
        (SELECT COALESCE(AVG(duration_ms), 0) FROM audit_logs WHERE workspace_id = ? AND created_at > NOW() - INTERVAL 1 DAY) as avg_ms,
        (SELECT COALESCE(SUM(cost_usd), 0) FROM audit_logs WHERE workspace_id = ? AND MONTH(created_at) = MONTH(NOW())) as cost_mtd,
        (SELECT COUNT(*) FROM audit_logs WHERE workspace_id = ? AND error IS NOT NULL AND created_at > NOW() - INTERVAL 7 DAY) as errors_week,
        (SELECT COUNT(*) FROM audit_logs WHERE workspace_id = ? AND created_at > NOW() - INTERVAL 7 DAY) as total_week
    `, [workspaceId, workspaceId, workspaceId, workspaceId, workspaceId, workspaceId, workspaceId])
    return rows[0]
  }

  async getActiveWorkspaceCount(): Promise<number> {
    const [rows] = await this.pool.execute<CountRow[]>('SELECT COUNT(*) as c FROM workspaces WHERE status = "active"')
    return rows[0].c
  }

  async getConnectedConnectionCount(): Promise<number> {
    const [rows] = await this.pool.execute<CountRow[]>("SELECT COUNT(*) as c FROM connections WHERE status = 'connected'")
    return rows[0].c
  }

  async getActiveConsumerCount(): Promise<number> {
    const [rows] = await this.pool.execute<CountRow[]>("SELECT COUNT(*) as c FROM consumers WHERE status = 'active'")
    return rows[0].c
  }

  async getFirstActiveWorkspace(): Promise<WorkspaceData | null> {
    const [rows] = await this.pool.execute<WsRow[]>('SELECT * FROM workspaces WHERE status = "active" LIMIT 1')
    return rows[0] || null
  }

  async findActivityLog(workspaceId: string, limit: number, offset: number): Promise<{ rows: ActivityLogData[]; total: number }> {
    const [rows] = await this.pool.execute<ActivityRow[]>(
      `SELECT id, consumer_type, channel, user_name, query, tools_called, connections_hit,
              tokens_input, tokens_output, cost_usd, duration_ms, error, created_at
       FROM audit_logs WHERE workspace_id = ?
       ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`,
      [workspaceId]
    )
    const [countRows] = await this.pool.execute<TotalRow[]>(
      'SELECT COUNT(*) as total FROM audit_logs WHERE workspace_id = ?', [workspaceId]
    )
    return { rows, total: countRows[0].total }
  }

  async findDefaultByOrg(orgId: string): Promise<WorkspaceData | null> {
    const [rows] = await this.pool.execute<WsRow[]>(
      'SELECT * FROM workspaces WHERE org_id = ? AND is_default = TRUE AND status = "active" LIMIT 1',
      [orgId]
    )
    return rows[0] || null
  }

  async listRoutingSummaries(orgId: string): Promise<WorkspaceRoutingSummary[]> {
    const [rows] = await this.pool.execute<RoutingSummaryRow[]>(
      `SELECT w.id, w.name, w.system_prompt,
              GROUP_CONCAT(ct.name SEPARATOR ',') as tool_names
       FROM workspaces w
       LEFT JOIN connections c ON c.workspace_id = w.id
       LEFT JOIN connection_tools ct ON ct.connection_id = c.id
       WHERE w.org_id = ? AND w.status = 'active' AND w.is_default = FALSE
       GROUP BY w.id`,
      [orgId]
    )
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      system_prompt: r.system_prompt,
      tool_names: r.tool_names ? r.tool_names.split(',') : [],
    }))
  }

  async setDefault(id: string): Promise<void> {
    await this.pool.execute(
      'UPDATE workspaces SET is_default = TRUE WHERE id = ?', [id]
    )
  }
}
