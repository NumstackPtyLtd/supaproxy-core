import type mysql from 'mysql2/promise'
import type { InstalledGuardrailRepository, InstalledGuardrailData, PluginMetadata } from '../../../domain/guardrail/installedGuardrailRepository.js'

interface InstalledRow extends mysql.RowDataPacket {
  id: string
  org_id: string
  plugin_id: string
  package_name: string
  package_version: string
  plugin_metadata: string | PluginMetadata
  installed_by: string
  installed_at: string
}

export class MysqlInstalledGuardrailRepository implements InstalledGuardrailRepository {
  constructor(private readonly pool: mysql.Pool) {}

  async findByOrg(orgId: string): Promise<InstalledGuardrailData[]> {
    const [rows] = await this.pool.execute<InstalledRow[]>(
      'SELECT * FROM installed_guardrails WHERE org_id = ? ORDER BY installed_at DESC',
      [orgId],
    )
    return rows.map(mapRow)
  }

  async findByOrgAndPlugin(orgId: string, pluginId: string): Promise<InstalledGuardrailData | null> {
    const [rows] = await this.pool.execute<InstalledRow[]>(
      'SELECT * FROM installed_guardrails WHERE org_id = ? AND plugin_id = ? LIMIT 1',
      [orgId, pluginId],
    )
    return rows[0] ? mapRow(rows[0]) : null
  }

  async install(data: InstalledGuardrailData): Promise<void> {
    await this.pool.execute(
      'INSERT INTO installed_guardrails (id, org_id, plugin_id, package_name, package_version, plugin_metadata, installed_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [data.id, data.org_id, data.plugin_id, data.package_name, data.package_version, JSON.stringify(data.plugin_metadata), data.installed_by],
    )
  }

  async uninstall(orgId: string, pluginId: string): Promise<void> {
    await this.pool.execute(
      'DELETE FROM installed_guardrails WHERE org_id = ? AND plugin_id = ?',
      [orgId, pluginId],
    )
  }
}

function parseMetadata(raw: string | PluginMetadata): PluginMetadata {
  if (typeof raw === 'object') return raw
  try { return JSON.parse(raw) } catch { return { name: '', description: '', author: '', version: '', stage: '', configSchema: { fields: [] } } }
}

function mapRow(r: InstalledRow): InstalledGuardrailData {
  return {
    id: r.id,
    org_id: r.org_id,
    plugin_id: r.plugin_id,
    package_name: r.package_name,
    package_version: r.package_version,
    plugin_metadata: parseMetadata(r.plugin_metadata),
    installed_by: r.installed_by,
    installed_at: r.installed_at,
  }
}
