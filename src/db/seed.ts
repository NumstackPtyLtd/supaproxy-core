/**
 * Development seed data.
 *
 * Populates a fresh database with useful fixtures for local development.
 * Safe to run multiple times (uses INSERT IGNORE).
 * Not used in production. The /setup flow handles production bootstrapping.
 */
import type mysql from 'mysql2/promise'
import { generateId } from '../domain/shared/EntityId.js'
import pino from 'pino'

const log = pino({ name: 'seed' })

export async function seed(pool: mysql.Pool): Promise<void> {
  // Only seed if an org exists (setup has been completed)
  const [orgs] = await pool.execute<mysql.RowDataPacket[]>('SELECT id FROM organisations LIMIT 1')
  if (orgs.length === 0) {
    log.info('No organisation found. Skipping seed (run setup first).')
    return
  }

  const orgId = orgs[0].id
  log.info({ orgId }, 'Seeding development data...')

  // ── Guardrail policies (org-level enforcement) ──
  await upsertPolicy(pool, orgId, '@supaproxy/guardrails:pattern', 'mandatory')
  await upsertPolicy(pool, orgId, '@supaproxy/guardrails:write-guard', 'recommended')
  await upsertPolicy(pool, orgId, '@supaproxy/guardrails:injection-sanitiser', 'recommended')

  // ── Consumer integrations (org-level) ──
  for (const type of ['slack', 'whatsapp', 'api']) {
    await pool.execute(
      `INSERT IGNORE INTO consumer_integrations (id, org_id, type, status) VALUES (?, ?, ?, 'active')`,
      [generateId(), orgId, type],
    )
  }

  // ── Enable all guardrails on every workspace ──
  const [workspaces] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT id FROM workspaces WHERE org_id = ? AND status != 'archived'`,
    [orgId],
  )

  const guardrails = [
    '@supaproxy/guardrails:pattern',
    '@supaproxy/guardrails:write-guard',
    '@supaproxy/guardrails:injection-sanitiser',
  ]

  for (const ws of workspaces) {
    for (const gId of guardrails) {
      await pool.execute(
        `INSERT IGNORE INTO workspace_guardrails (id, workspace_id, guardrail_id, enabled) VALUES (?, ?, ?, TRUE)`,
        [generateId(), ws.id, gId],
      )
    }
  }

  // ── Publish #general workspace ──
  await pool.execute(
    `UPDATE workspaces SET is_default = TRUE WHERE org_id = ? AND name = '#general'`,
    [orgId],
  )

  log.info('Seed complete.')
}

async function upsertPolicy(pool: mysql.Pool, orgId: string, pluginId: string, enforcement: string): Promise<void> {
  await pool.execute(
    `INSERT INTO guardrail_policies (id, org_id, plugin_id, enforcement)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE enforcement = VALUES(enforcement)`,
    [generateId(), orgId, pluginId, enforcement],
  )
}
