export interface GuardrailConfig {
  cost_cap_monthly_usd?: number
  rate_limit?: {
    per_user_per_minute?: number
    per_workspace_per_hour?: number
  }
  blocked_topics?: string[]
}

export interface PreQueryGuardDeps {
  getMonthlySpend(workspaceId: string): Promise<number>
  getWorkspaceGuardrailConfig(workspaceId: string): Promise<GuardrailConfig | null>
  getRecentQueryCount(scope: string, windowSeconds: number): Promise<number>
}

export interface GuardResult {
  allowed: boolean
  reason?: string
  code?: 'COST_CAP_EXCEEDED' | 'RATE_LIMIT_EXCEEDED' | 'BLOCKED_TOPIC'
}

const PASS: GuardResult = { allowed: true }

export class PreQueryGuardService {
  constructor(private readonly deps: PreQueryGuardDeps) {}

  async check(workspaceId: string, userId?: string): Promise<GuardResult> {
    const config = await this.deps.getWorkspaceGuardrailConfig(workspaceId)
    if (!config) return PASS

    // Cost cap
    if (config.cost_cap_monthly_usd != null) {
      const spend = await this.deps.getMonthlySpend(workspaceId)
      if (spend >= config.cost_cap_monthly_usd) {
        return {
          allowed: false,
          reason: 'Monthly cost cap reached for this workspace.',
          code: 'COST_CAP_EXCEEDED',
        }
      }
    }

    // Rate limits
    if (config.rate_limit) {
      const rl = config.rate_limit

      if (rl.per_user_per_minute && userId) {
        const count = await this.deps.getRecentQueryCount(`user:${userId}:${workspaceId}`, 60)
        if (count >= rl.per_user_per_minute) {
          return {
            allowed: false,
            reason: 'Rate limit exceeded. Please wait before sending another query.',
            code: 'RATE_LIMIT_EXCEEDED',
          }
        }
      }

      if (rl.per_workspace_per_hour) {
        const count = await this.deps.getRecentQueryCount(`workspace:${workspaceId}`, 3600)
        if (count >= rl.per_workspace_per_hour) {
          return {
            allowed: false,
            reason: 'This workspace has reached its hourly query limit.',
            code: 'RATE_LIMIT_EXCEEDED',
          }
        }
      }
    }

    return PASS
  }

  async checkQuery(workspaceId: string, userId: string | undefined, query: string): Promise<GuardResult> {
    // Run cost cap and rate limit checks first
    const preCheck = await this.check(workspaceId, userId)
    if (!preCheck.allowed) return preCheck

    // Blocked topics
    const config = await this.deps.getWorkspaceGuardrailConfig(workspaceId)
    if (config?.blocked_topics && config.blocked_topics.length > 0) {
      const lowerQuery = query.toLowerCase()
      for (const topic of config.blocked_topics) {
        if (lowerQuery.includes(topic.toLowerCase())) {
          return {
            allowed: false,
            reason: `This query touches a blocked topic and cannot be processed.`,
            code: 'BLOCKED_TOPIC',
          }
        }
      }
    }

    return PASS
  }
}
