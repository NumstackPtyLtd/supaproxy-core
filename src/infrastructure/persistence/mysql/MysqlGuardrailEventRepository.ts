import type mysql from 'mysql2/promise'
import type { GuardrailEventRepository, GuardrailEventData } from '../../../domain/guardrail/repository.js'

interface GuardrailEventRow extends mysql.RowDataPacket {
  id: string
  workspace_id: string
  conversation_id: string | null
  event_type: string
  plugin_id: string
  tool_name: string | null
  tool_args: string | null
  connection_name: string | null
  original_query: string | null
  reason: string | null
  original_content: string | null
  stripped_content: string | null
  created_at: string
}

export class MysqlGuardrailEventRepository implements GuardrailEventRepository {
  constructor(private readonly pool: mysql.Pool) {}

  async create(data: GuardrailEventData): Promise<void> {
    await this.pool.execute(
      `INSERT INTO guardrail_events (id, workspace_id, conversation_id, event_type, plugin_id, tool_name, tool_args, connection_name, original_query, reason, original_content, stripped_content) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.id, data.workspace_id, data.conversation_id, data.event_type, data.plugin_id, data.tool_name, data.tool_args, data.connection_name, data.original_query, data.reason, data.original_content, data.stripped_content],
    )
  }

  async findByWorkspace(workspaceId: string, limit = 50): Promise<GuardrailEventData[]> {
    const [rows] = await this.pool.execute<GuardrailEventRow[]>(
      `SELECT * FROM guardrail_events WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?`,
      [workspaceId, String(limit)],
    )
    return rows.map(r => ({
      id: r.id,
      workspace_id: r.workspace_id,
      conversation_id: r.conversation_id,
      event_type: r.event_type as GuardrailEventData['event_type'],
      plugin_id: r.plugin_id,
      tool_name: r.tool_name,
      tool_args: r.tool_args,
      connection_name: r.connection_name,
      original_query: r.original_query,
      reason: r.reason,
      original_content: r.original_content,
      stripped_content: r.stripped_content,
      created_at: r.created_at,
    }))
  }
}
