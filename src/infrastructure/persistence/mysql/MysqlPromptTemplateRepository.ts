import type mysql from 'mysql2/promise'
import type { RowDataPacket } from 'mysql2'
import type { PromptTemplateRepository, PromptTemplateData, PromptType, PromptScope } from '../../../domain/prompt/repository.js'

interface PromptRow extends RowDataPacket, PromptTemplateData {}

export class MysqlPromptTemplateRepository implements PromptTemplateRepository {
  constructor(private readonly pool: mysql.Pool) {}

  async findActive(promptType: PromptType, scope: PromptScope, scopeId: string | null): Promise<PromptTemplateData | null> {
    const [rows] = await this.pool.execute<PromptRow[]>(
      `SELECT * FROM prompt_templates
       WHERE prompt_type = ? AND scope = ? AND scope_id <=> ? AND is_active = TRUE AND is_draft = FALSE
       ORDER BY version DESC LIMIT 1`,
      [promptType, scope, scopeId]
    )
    return rows[0] || null
  }

  async findAllActive(scope: PromptScope, scopeId: string | null): Promise<PromptTemplateData[]> {
    const [rows] = await this.pool.execute<PromptRow[]>(
      `SELECT * FROM prompt_templates
       WHERE scope = ? AND scope_id <=> ? AND is_active = TRUE AND is_draft = FALSE
       ORDER BY prompt_type`,
      [scope, scopeId]
    )
    return rows
  }

  async findVersions(promptType: PromptType, scope: PromptScope, scopeId: string | null): Promise<PromptTemplateData[]> {
    const [rows] = await this.pool.execute<PromptRow[]>(
      `SELECT * FROM prompt_templates
       WHERE prompt_type = ? AND scope = ? AND scope_id <=> ?
       ORDER BY version DESC`,
      [promptType, scope, scopeId]
    )
    return rows
  }

  async create(data: {
    id: string
    promptType: PromptType
    scope: PromptScope
    scopeId: string | null
    content: string
    version: number
    isDraft: boolean
    createdBy: string | null
  }): Promise<void> {
    await this.pool.execute(
      `INSERT INTO prompt_templates (id, prompt_type, scope, scope_id, content, version, is_active, is_draft, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.id, data.promptType, data.scope, data.scopeId, data.content, data.version, !data.isDraft, data.isDraft, data.createdBy]
    )
  }

  async activate(id: string): Promise<void> {
    await this.pool.execute(
      `UPDATE prompt_templates SET is_active = TRUE, is_draft = FALSE WHERE id = ?`,
      [id]
    )
  }

  async deactivateAllForType(promptType: PromptType, scope: PromptScope, scopeId: string | null): Promise<void> {
    await this.pool.execute(
      `UPDATE prompt_templates SET is_active = FALSE WHERE prompt_type = ? AND scope = ? AND scope_id <=> ?`,
      [promptType, scope, scopeId]
    )
  }
}
