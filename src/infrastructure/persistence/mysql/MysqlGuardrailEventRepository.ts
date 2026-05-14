import type mysql from 'mysql2/promise'
import type { GuardrailEventRepository, GuardrailEventData, GuardrailEventFilter, EventStatus } from '../../../domain/guardrail/repository.js'

interface GuardrailEventRow extends mysql.RowDataPacket {
  id: string
  workspace_id: string
  conversation_id: string | null
  event_type: string
  plugin_id: string
  context: string | null
  outcome: string | null
  display: string | null
  actions: string | null
  status: string
  created_at: string
}

interface CountRow extends mysql.RowDataPacket {
  total: number
}

export class MysqlGuardrailEventRepository implements GuardrailEventRepository {
  constructor(private readonly pool: mysql.Pool) {}

  async create(data: GuardrailEventData): Promise<void> {
    await this.pool.execute(
      `INSERT INTO guardrail_events (id, workspace_id, conversation_id, event_type, plugin_id, context, outcome, display, actions, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.id, data.workspace_id, data.conversation_id, data.event_type, data.plugin_id, JSON.stringify(data.context), JSON.stringify(data.outcome), JSON.stringify(data.display), JSON.stringify(data.actions), data.status],
    )
  }

  async findByWorkspace(workspaceId: string, limit = 50): Promise<GuardrailEventData[]> {
    const [rows] = await this.pool.execute<GuardrailEventRow[]>(
      `SELECT * FROM guardrail_events WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?`,
      [workspaceId, String(limit)],
    )
    return rows.map(mapRow)
  }

  async findByWorkspaceFiltered(workspaceId: string, filter: GuardrailEventFilter): Promise<{ events: GuardrailEventData[]; total: number }> {
    const { conditions, params } = this.buildWhere(workspaceId, filter)
    const where = conditions.join(' AND ')
    const limit = filter.limit ?? 20
    const offset = filter.offset ?? 0

    const [[countResult], [rows]] = await Promise.all([
      this.pool.execute<CountRow[]>(`SELECT COUNT(*) AS total FROM guardrail_events WHERE ${where}`, params),
      this.pool.execute<GuardrailEventRow[]>(
        `SELECT * FROM guardrail_events WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [...params, String(limit), String(offset)],
      ),
    ])

    return { events: rows.map(mapRow), total: countResult[0]?.total ?? 0 }
  }

  async updateStatus(id: string, status: EventStatus): Promise<void> {
    await this.pool.execute(
      `UPDATE guardrail_events SET status = ? WHERE id = ?`,
      [status, id],
    )
  }

  private buildWhere(workspaceId: string, filter: GuardrailEventFilter): { conditions: string[]; params: string[] } {
    const conditions: string[] = ['workspace_id = ?']
    const params: string[] = [workspaceId]

    if (filter.event_type) {
      conditions.push('event_type = ?')
      params.push(filter.event_type)
    }

    if (filter.status) {
      conditions.push('status = ?')
      params.push(filter.status)
    }

    if (filter.search) {
      conditions.push(`(
        plugin_id LIKE ? OR
        JSON_UNQUOTE(JSON_EXTRACT(context, '$.tool_name')) LIKE ? OR
        JSON_UNQUOTE(JSON_EXTRACT(context, '$.connection_name')) LIKE ? OR
        JSON_UNQUOTE(JSON_EXTRACT(outcome, '$.reason')) LIKE ?
      )`)
      const term = `%${filter.search}%`
      params.push(term, term, term, term)
    }

    return { conditions, params }
  }
}

function parseJson(raw: string | object | null): Record<string, unknown> {
  if (!raw) return {}
  if (typeof raw === 'object') return raw as Record<string, unknown>
  try { return JSON.parse(raw) } catch { return {} }
}

function parseJsonArray<T>(raw: string | T[] | null): T[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  try { return JSON.parse(raw) } catch { return [] }
}

function mapRow(r: GuardrailEventRow): GuardrailEventData {
  return {
    id: r.id,
    workspace_id: r.workspace_id,
    conversation_id: r.conversation_id,
    event_type: r.event_type as GuardrailEventData['event_type'],
    plugin_id: r.plugin_id,
    context: parseJson(r.context),
    outcome: parseJson(r.outcome),
    display: parseJsonArray(r.display),
    actions: parseJsonArray(r.actions),
    status: r.status as GuardrailEventData['status'],
    created_at: r.created_at,
  }
}
