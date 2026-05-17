import type mysql from 'mysql2/promise'
import type { PreQueryGuardDeps, GuardrailConfig } from '../../application/query/PreQueryGuardService.js'
import Redis from 'ioredis'
import pino from 'pino'

const log = pino({ name: 'pre-query-guard' })

interface SpendRow extends mysql.RowDataPacket {
  total: number
}

interface ConfigRow extends mysql.RowDataPacket {
  config: string | null
}

export class PreQueryGuardDepsImpl implements PreQueryGuardDeps {
  private redis: Redis | null = null

  constructor(
    private readonly pool: mysql.Pool,
    private readonly redisHost?: string,
    private readonly redisPort?: number,
  ) {
    if (redisHost && redisPort) {
      this.redis = new Redis({ host: redisHost, port: redisPort, maxRetriesPerRequest: 1, lazyConnect: true })
      this.redis.connect().catch(() => { this.redis = null })
    }
  }

  async getMonthlySpend(workspaceId: string): Promise<number> {
    const [rows] = await this.pool.execute<SpendRow[]>(
      `SELECT COALESCE(SUM(cost_usd), 0) AS total FROM audit_logs WHERE workspace_id = ? AND created_at >= DATE_FORMAT(NOW(), '%Y-%m-01')`,
      [workspaceId],
    )
    return Number(rows[0]?.total ?? 0)
  }

  async getWorkspaceGuardrailConfig(workspaceId: string): Promise<GuardrailConfig | null> {
    // Read the merged config from all enabled workspace guardrails.
    // Individual guardrail configs may contain cost_cap, rate_limit, or blocked_topics.
    const [rows] = await this.pool.execute<ConfigRow[]>(
      `SELECT config FROM workspace_guardrails WHERE workspace_id = ? AND enabled = TRUE AND config IS NOT NULL`,
      [workspaceId],
    )
    if (rows.length === 0) return null

    const merged: GuardrailConfig = {}
    for (const row of rows) {
      if (!row.config) continue
      try {
        const cfg = typeof row.config === 'string' ? JSON.parse(row.config) : row.config
        if (cfg.cost_cap_monthly_usd != null) merged.cost_cap_monthly_usd = cfg.cost_cap_monthly_usd
        if (cfg.rate_limit) merged.rate_limit = { ...merged.rate_limit, ...cfg.rate_limit }
        if (cfg.blocked_topics) merged.blocked_topics = [...(merged.blocked_topics || []), ...cfg.blocked_topics]
      } catch { /* skip invalid JSON */ }
    }
    return Object.keys(merged).length > 0 ? merged : null
  }

  async getRecentQueryCount(scope: string, windowSeconds: number): Promise<number> {
    if (!this.redis) return 0
    const key = `ratelimit:${scope}`
    try {
      const count = await this.redis.incr(key)
      if (count === 1) {
        await this.redis.expire(key, windowSeconds)
      }
      // We incremented for the current request; return count - 1 to reflect "before this request"
      return count - 1
    } catch (err) {
      log.warn({ err }, 'Redis query count failed, defaulting to 0')
      return 0
    }
  }
}
