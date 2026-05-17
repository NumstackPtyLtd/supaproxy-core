import type mysql from 'mysql2/promise'
import type { AuditLogRepository, AuditLogData } from '../../../domain/audit/repository.js'

export class MysqlAuditLogRepository implements AuditLogRepository {
  constructor(private readonly pool: mysql.Pool) {}

  async create(data: AuditLogData): Promise<void> {
    await this.pool.execute(
      `INSERT INTO audit_logs (id, workspace_id, conversation_id, consumer_type, channel, user_id, user_name, query, tools_called, connections_hit, tokens_input, tokens_output, cost_usd, duration_ms, error, input_screening_action, input_screening_categories, input_screening_ms, knowledge_chunks_used)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.id, data.workspace_id, data.conversation_id, data.consumer_type, data.channel, data.user_id, data.user_name, data.query, data.tools_called, data.connections_hit, data.tokens_input, data.tokens_output, data.cost_usd, data.duration_ms, data.error, data.input_screening_action, data.input_screening_categories, data.input_screening_ms, data.knowledge_chunks_used]
    )
  }
}
