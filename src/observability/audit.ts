import { appendFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import type { AuditEntry } from '../shared/index.js'
import pino from 'pino'
import { LOG_DIR } from '../config.js'

const log = pino({ name: 'audit' })

export function logAuditEntry(entry: AuditEntry): void {
  try {
    if (!LOG_DIR) {
      log.warn('SUPAPROXY_LOG_DIR not set, skipping audit file write')
      return
    }
    mkdirSync(LOG_DIR, { recursive: true })
    const line = JSON.stringify(entry) + '\n'
    appendFileSync(join(LOG_DIR, 'audit.jsonl'), line)
    log.info({
      workspace: entry.workspace_id,
      user: entry.user_id,
      tools: entry.tools_called.map(t => t.name),
      cost: entry.cost_usd,
    }, 'Query logged')
  } catch (err) {
    log.error({ error: (err as Error).message }, 'Failed to write audit log')
  }
}
