import type { ConversationRepository } from '../../domain/conversation/repository.js'
import { safeJsonParse } from '../../shared/json.js'

interface ViolationItem { rule: string; description: string }
interface KnowledgeGapItem { topic: string; [key: string]: unknown }

export class GetDashboardUseCase {
  constructor(private readonly conversationRepo: ConversationRepository) {}

  async execute(workspaceId: string) {
    const [tickets, sentimentRows, compRows, gapRows, resRows, catRows, chanRows, costUsage, recentConversations] = await Promise.all([
      this.conversationRepo.getTicketSummary(workspaceId),
      this.conversationRepo.getSentimentDistribution(workspaceId),
      this.conversationRepo.getComplianceStats(workspaceId, 50),
      this.conversationRepo.getKnowledgeGapStats(workspaceId, 50),
      this.conversationRepo.getResolutionDistribution(workspaceId),
      this.conversationRepo.getCategoryDistribution(workspaceId),
      this.conversationRepo.getChannelDistribution(workspaceId),
      this.conversationRepo.getCostAndUsage(workspaceId),
      this.conversationRepo.getRecentConversations(workspaceId, 10),
    ])

    const sentiment = this.buildSentiment(sentimentRows)
    const compliance = this.buildCompliance(compRows)
    const knowledgeGaps = this.buildKnowledgeGaps(gapRows)
    const resolution = this.buildDistribution(resRows, ['resolved', 'unresolved', 'escalated', 'abandoned'])
    const categories = this.buildCountMap(catRows)
    const channels = this.buildCountMap(chanRows)

    return {
      tickets,
      sentiment,
      compliance,
      knowledge_gaps: knowledgeGaps,
      resolution,
      cost: { today: Number(costUsage.cost_today) || 0, this_week: Number(costUsage.cost_week) || 0, this_month: Number(costUsage.cost_month) || 0 },
      usage: { queries_today: Number(costUsage.q_today) || 0, queries_this_week: Number(costUsage.q_week) || 0, queries_this_month: Number(costUsage.q_month) || 0 },
      recent_conversations: recentConversations,
      categories,
      channels,
    }
  }

  private buildSentiment(rows: Array<{ score: number; count: number }>) {
    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    let total = 0
    let sum = 0
    for (const r of rows) {
      distribution[r.score] = r.count
      total += r.count
      sum += r.score * r.count
    }
    return {
      average: total > 0 ? Math.round((sum / total) * 10) / 10 : 0,
      distribution,
    }
  }

  private buildCompliance(rows: Array<{ compliance_violations: string | null; conversation_id: string; created_at: string }>) {
    let totalViolations = 0
    const recent: Array<ViolationItem & { conversation_id: string; timestamp: string }> = []
    const byRule: Record<string, number> = {}

    for (const r of rows) {
      const violations: ViolationItem[] = typeof r.compliance_violations === 'string' ? safeJsonParse<ViolationItem[]>(r.compliance_violations, []) : (r.compliance_violations || [])
      totalViolations += violations.length
      for (const v of violations) {
        byRule[v.rule] = (byRule[v.rule] || 0) + 1
        if (recent.length < 5) {
          recent.push({ rule: v.rule, description: v.description, conversation_id: r.conversation_id, timestamp: r.created_at })
        }
      }
    }

    return { total_violations: totalViolations, recent, by_rule: byRule }
  }

  private buildKnowledgeGaps(rows: Array<{ knowledge_gaps: string | null; created_at: string }>) {
    const counts: Record<string, { count: number; last_seen: string }> = {}
    for (const r of rows) {
      const gaps: KnowledgeGapItem[] = typeof r.knowledge_gaps === 'string' ? safeJsonParse<KnowledgeGapItem[]>(r.knowledge_gaps, []) : (r.knowledge_gaps || [])
      for (const g of gaps) {
        if (!counts[g.topic]) counts[g.topic] = { count: 0, last_seen: r.created_at }
        counts[g.topic].count++
      }
    }
    const topics = Object.entries(counts)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5)
      .map(([topic, { count, last_seen }]) => ({ topic, count, last_seen }))
    return { topics }
  }

  private buildDistribution(rows: Array<{ status?: string; category?: string; consumer_type?: string; count: number }>, defaultKeys: string[]): Record<string, number> {
    const result: Record<string, number> = {}
    for (const key of defaultKeys) result[key] = 0
    for (const r of rows) {
      const key = r.status || r.category || r.consumer_type || ''
      result[key] = r.count
    }
    return result
  }

  private buildCountMap(rows: Array<{ category?: string; consumer_type?: string; count: number }>): Record<string, number> {
    const result: Record<string, number> = {}
    for (const r of rows) {
      const key = r.category || r.consumer_type || ''
      result[key] = r.count
    }
    return result
  }
}
