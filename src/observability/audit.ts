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

/** Per-million-token pricing by model. Add entries as needed. */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-20250514': { input: 3, output: 15 },
  'claude-haiku-4-5-20251001': { input: 0.80, output: 4 },
  'gpt-4o': { input: 2.50, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
}

/** Estimate cost based on token usage and model. Returns null if pricing is unknown. */
export function estimateCost(tokens: { input: number; output: number }, model?: string): number | null {
  const pricing = model ? MODEL_PRICING[model] : undefined
  if (!pricing) return null
  return (tokens.input * pricing.input + tokens.output * pricing.output) / 1_000_000
}
