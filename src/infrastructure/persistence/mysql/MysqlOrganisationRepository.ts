import type mysql from 'mysql2/promise'
import type { RowDataPacket } from 'mysql2'
import type { OrganisationRepository, OrgData, UserData, OrgSettingData, TeamData } from '../../../domain/organisation/repository.js'

interface OrgRow extends RowDataPacket { id: string; name: string; slug: string; created_at: string }
interface UserRow extends RowDataPacket { id: string; org_id: string | null; email: string; name: string; password_hash: string; org_role: 'admin' | 'workspace_admin' | 'user'; created_at: string }
interface SettingRow extends RowDataPacket { id: string; key_name: string; value: string; is_secret: boolean }
interface TeamRow extends RowDataPacket { id: string; name: string }
interface IdRow extends RowDataPacket { id: string }
interface ValueRow extends RowDataPacket { value: string }
interface KeyValueRow extends RowDataPacket { key_name: string; value: string }
interface UserListRow extends RowDataPacket { id: string; name: string; email: string; org_role: string; created_at: string }
interface CountRow extends RowDataPacket { total: number }

export class MysqlOrganisationRepository implements OrganisationRepository {
  constructor(private readonly pool: mysql.Pool) {}

  async findById(id: string): Promise<OrgData | null> {
    const [rows] = await this.pool.execute<OrgRow[]>(
      'SELECT id, name, slug, created_at FROM organisations WHERE id = ?', [id]
    )
    return rows[0] || null
  }

  async anyExists(): Promise<boolean> {
    const [rows] = await this.pool.execute<CountRow[]>('SELECT COUNT(*) as total FROM organisations')
    return rows[0].total > 0
  }

  async create(id: string, name: string, slug: string): Promise<void> {
    await this.pool.execute(
      'INSERT INTO organisations (id, name, slug) VALUES (?, ?, ?)', [id, name, slug]
    )
  }

  async updateName(id: string, name: string): Promise<void> {
    await this.pool.execute('UPDATE organisations SET name = ? WHERE id = ?', [name, id])
  }

  async findUserByEmail(email: string): Promise<UserData | null> {
    const [rows] = await this.pool.execute<UserRow[]>(
      'SELECT * FROM users WHERE email = ?', [email]
    )
    return rows[0] || null
  }

  async findUserById(id: string): Promise<UserData | null> {
    const [rows] = await this.pool.execute<UserRow[]>(
      'SELECT * FROM users WHERE id = ?', [id]
    )
    return rows[0] || null
  }

  async userExistsByEmail(email: string): Promise<boolean> {
    const [rows] = await this.pool.execute<IdRow[]>(
      'SELECT id FROM users WHERE email = ?', [email]
    )
    return rows.length > 0
  }

  async createUser(id: string, orgId: string, email: string, name: string, passwordHash: string, role: string): Promise<void> {
    await this.pool.execute(
      'INSERT INTO users (id, org_id, email, name, password_hash, org_role) VALUES (?, ?, ?, ?, ?, ?)',
      [id, orgId, email, name, passwordHash, role]
    )
  }

  async listUsers(orgId: string, params?: { search?: string; limit?: number; offset?: number }): Promise<{ users: Array<{ id: string; name: string; email: string; org_role: string; created_at: string }>; total: number }> {
    const conditions = ['org_id = ?']
    const values: string[] = [orgId]

    if (params?.search) {
      conditions.push('(name LIKE ? OR email LIKE ?)')
      const term = `%${params.search}%`
      values.push(term, term)
    }

    const where = conditions.join(' AND ')
    const limit = params?.limit ?? 50
    const offset = params?.offset ?? 0

    const [[countResult], [rows]] = await Promise.all([
      this.pool.execute<CountRow[]>(`SELECT COUNT(*) AS total FROM users WHERE ${where}`, values),
      this.pool.execute<UserListRow[]>(
        `SELECT id, name, email, org_role, created_at FROM users WHERE ${where} ORDER BY created_at LIMIT ? OFFSET ?`,
        [...values, String(limit), String(offset)],
      ),
    ])

    return { users: rows, total: (countResult[0] as { total: number })?.total ?? 0 }
  }

  async listSettings(orgId: string): Promise<OrgSettingData[]> {
    const [rows] = await this.pool.execute<SettingRow[]>(
      'SELECT id, key_name, value, is_secret FROM org_settings WHERE org_id = ?', [orgId]
    )
    return rows
  }

  async findSetting(orgId: string, key: string): Promise<OrgSettingData | null> {
    const [rows] = await this.pool.execute<SettingRow[]>(
      'SELECT id, key_name, value, is_secret FROM org_settings WHERE org_id = ? AND key_name = ?', [orgId, key]
    )
    return rows[0] || null
  }

  async upsertSetting(id: string, orgId: string, key: string, value: string, isSecret: boolean): Promise<void> {
    const [existing] = await this.pool.execute<IdRow[]>(
      'SELECT id FROM org_settings WHERE org_id = ? AND key_name = ?', [orgId, key]
    )
    if (existing[0]) {
      await this.pool.execute(
        'UPDATE org_settings SET value = ?, is_secret = ? WHERE id = ?', [value, isSecret, existing[0].id]
      )
    } else {
      await this.pool.execute(
        'INSERT INTO org_settings (id, org_id, key_name, value, is_secret) VALUES (?, ?, ?, ?, ?)',
        [id, orgId, key, value, isSecret]
      )
    }
  }

  async getSettingValue(key: string): Promise<string | null> {
    const [rows] = await this.pool.execute<ValueRow[]>(
      'SELECT value FROM org_settings WHERE key_name = ? AND value IS NOT NULL AND value != \'\' LIMIT 1', [key]
    )
    return rows[0]?.value || null
  }

  async getSettingValues(keys: string[]): Promise<Record<string, string>> {
    if (keys.length === 0) return {}
    const placeholders = keys.map(() => '?').join(',')
    const [rows] = await this.pool.execute<KeyValueRow[]>(
      `SELECT key_name, value FROM org_settings WHERE key_name IN (${placeholders})`, keys
    )
    const result: Record<string, string> = {}
    for (const r of rows) result[r.key_name] = r.value
    return result
  }

  async listTeams(orgId: string): Promise<TeamData[]> {
    const [rows] = await this.pool.execute<TeamRow[]>(
      'SELECT id, name FROM teams WHERE org_id = ? ORDER BY name', [orgId]
    )
    return rows
  }

  async findTeamByName(orgId: string, name: string): Promise<TeamData | null> {
    const [rows] = await this.pool.execute<TeamRow[]>(
      'SELECT id, name FROM teams WHERE org_id = ? AND name = ?', [orgId, name]
    )
    return rows[0] || null
  }

  async createTeam(id: string, orgId: string, name: string): Promise<void> {
    await this.pool.execute(
      'INSERT INTO teams (id, org_id, name) VALUES (?, ?, ?)', [id, orgId, name]
    )
  }

  async getFirstOrgId(): Promise<string | null> {
    const [rows] = await this.pool.execute<OrgRow[]>(
      'SELECT id FROM organisations LIMIT 1'
    )
    return rows[0]?.id || null
  }
}
