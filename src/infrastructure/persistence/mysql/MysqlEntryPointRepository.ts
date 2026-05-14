import type mysql from 'mysql2/promise'
import type { EntryPointRepository, EntryPointData, EntryPointWithIntegration } from '../../../domain/integration/repository.js'

interface EntryPointRow extends mysql.RowDataPacket {
  id: string
  integration_id: string
  channel_id: string
  channel_name: string | null
  direct: number
  direct_workspace_id: string | null
  created_at: string
}

interface EntryPointWithTypeRow extends EntryPointRow {
  integration_type: string
  org_id: string
}

export class MysqlEntryPointRepository implements EntryPointRepository {
  constructor(private readonly pool: mysql.Pool) {}

  async findByIntegration(integrationId: string): Promise<EntryPointData[]> {
    const [rows] = await this.pool.execute<EntryPointRow[]>(
      'SELECT * FROM entry_points WHERE integration_id = ? ORDER BY channel_name, channel_id',
      [integrationId],
    )
    return rows.map(mapRow)
  }

  async findByChannel(type: string, channelId: string): Promise<EntryPointWithIntegration | null> {
    const [rows] = await this.pool.execute<EntryPointWithTypeRow[]>(
      `SELECT ep.*, ci.type AS integration_type, ci.org_id
       FROM entry_points ep
       JOIN consumer_integrations ci ON ci.id = ep.integration_id
       WHERE ci.type = ? AND ep.channel_id = ? AND ci.status = 'active'
       LIMIT 1`,
      [type, channelId],
    )
    if (!rows[0]) return null
    const r = rows[0]
    return { ...mapRow(r), integration_type: r.integration_type, org_id: r.org_id }
  }

  async findById(id: string): Promise<EntryPointData | null> {
    const [rows] = await this.pool.execute<EntryPointRow[]>(
      'SELECT * FROM entry_points WHERE id = ? LIMIT 1', [id],
    )
    return rows[0] ? mapRow(rows[0]) : null
  }

  async create(data: EntryPointData): Promise<void> {
    await this.pool.execute(
      'INSERT INTO entry_points (id, integration_id, channel_id, channel_name, direct, direct_workspace_id) VALUES (?, ?, ?, ?, ?, ?)',
      [data.id, data.integration_id, data.channel_id, data.channel_name, data.direct ? 1 : 0, data.direct_workspace_id],
    )
  }

  async update(id: string, data: { channel_name?: string; direct?: boolean; direct_workspace_id?: string | null }): Promise<void> {
    const sets: string[] = []
    const params: (string | number | null)[] = []

    if (data.channel_name !== undefined) { sets.push('channel_name = ?'); params.push(data.channel_name); }
    if (data.direct !== undefined) { sets.push('direct = ?'); params.push(data.direct ? 1 : 0); }
    if (data.direct_workspace_id !== undefined) { sets.push('direct_workspace_id = ?'); params.push(data.direct_workspace_id); }

    if (sets.length === 0) return
    params.push(id)
    await this.pool.execute(`UPDATE entry_points SET ${sets.join(', ')} WHERE id = ?`, params)
  }

  async delete(id: string): Promise<void> {
    await this.pool.execute('DELETE FROM entry_points WHERE id = ?', [id])
  }

  async findByOrg(orgId: string): Promise<Array<EntryPointData & { integration_type: string }>> {
    const [rows] = await this.pool.execute<EntryPointWithTypeRow[]>(
      `SELECT ep.*, ci.type AS integration_type, ci.org_id
       FROM entry_points ep
       JOIN consumer_integrations ci ON ci.id = ep.integration_id
       WHERE ci.org_id = ?
       ORDER BY ci.type, ep.channel_name, ep.channel_id`,
      [orgId],
    )
    return rows.map(r => ({ ...mapRow(r), integration_type: r.integration_type }))
  }
}

function mapRow(r: EntryPointRow): EntryPointData {
  return {
    id: r.id,
    integration_id: r.integration_id,
    channel_id: r.channel_id,
    channel_name: r.channel_name,
    direct: Boolean(r.direct),
    direct_workspace_id: r.direct_workspace_id,
    created_at: r.created_at,
  }
}
