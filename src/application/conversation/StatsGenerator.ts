import type { ConversationRepository } from '../../domain/conversation/repository.js'
import type { ProviderPlugin } from '@supaproxy/providers'
import { generateId } from '../../domain/shared/EntityId.js'
import { StatsStatus } from '../../domain/conversation/StatsStatus.js'
import { Duration } from '../../domain/shared/valueObjects.js'
import { parseStatsAnalysis } from '../../domain/shared/jsonMappers.js'
import { DEFAULT_STATS_ANALYSIS_MAX_TOKENS, DEFAULT_SENTIMENT_SCORE } from '../../defaults.js'
import { buildAnalysisPrompt } from '../../prompts.js'
import pino from 'pino'

const log = pino({ name: 'stats-generator' })

export type ProviderResolver = (providerType: string | null) => Promise<{ provider: ProviderPlugin; apiKey: string } | null>

export class StatsGenerator {
  constructor(
    private readonly conversationRepo: ConversationRepository,
    private readonly resolveProvider: ProviderResolver,
  ) {}

  async generate(conversationId: string): Promise<void> {
    const existing = await this.conversationRepo.findStats(conversationId)
    let statsId: string
    if (existing) {
      if (existing.stats_status === StatsStatus.COMPLETE) return
      statsId = existing.id
    } else {
      statsId = generateId()
      await this.conversationRepo.createStats(statsId, conversationId)
    }

    try {
      await this.runAnalysis(statsId, conversationId)
    } catch (err) {
      await this.conversationRepo.updateStatsStatus(statsId, StatsStatus.FAILED)
      log.error({ conversationId, error: (err as Error).message }, 'Stats generation failed')
    }
  }

  private async runAnalysis(statsId: string, conversationId: string): Promise<void> {
    const messages = await this.conversationRepo.findMessages(conversationId)
    if (messages.length === 0) {
      await this.conversationRepo.updateStatsStatus(statsId, StatsStatus.FAILED)
      return
    }

    const aggregate = await this.conversationRepo.getAggregateData(conversationId)
    const timestamps = await this.conversationRepo.getTimestamps(conversationId)
    const providerInfo = await this.conversationRepo.getWorkspaceProviderInfo(conversationId)

    if (!providerInfo) {
      await this.conversationRepo.updateStatsStatus(statsId, StatsStatus.FAILED)
      return
    }

    const resolved = await this.resolveProvider(providerInfo.provider_type)
    if (!resolved) {
      await this.conversationRepo.updateStatsStatus(statsId, StatsStatus.FAILED)
      return
    }

    const durationSec = timestamps?.first_message_at && timestamps?.closed_at
      ? Duration.fromMs(new Date(timestamps.closed_at).getTime() - new Date(timestamps.first_message_at).getTime()).seconds
      : 0

    const transcript = messages.map(m => `${m.role}: ${m.content}`).join('\n\n')
    const analysisText = await resolved.provider.createSimpleMessage({
      apiKey: resolved.apiKey,
      model: providerInfo.model,
      maxTokens: DEFAULT_STATS_ANALYSIS_MAX_TOKENS,
      prompt: buildAnalysisPrompt(transcript),
    })

    const parsed = parseStatsAnalysis(analysisText)

    await this.conversationRepo.updateStatsComplete(statsId, {
      sentimentScore: (parsed.sentiment_score as number) || DEFAULT_SENTIMENT_SCORE,
      resolutionStatus: (parsed.resolution_status as string) || 'unresolved',
      complianceViolations: JSON.stringify(parsed.compliance_violations || []),
      knowledgeGaps: JSON.stringify(parsed.knowledge_gaps || []),
      fraudIndicators: JSON.stringify(parsed.fraud_indicators || []),
      toolsUsed: JSON.stringify(parsed.tools_used || []),
      totalTokensInput: aggregate.total_tokens_input,
      totalTokensOutput: aggregate.total_tokens_output,
      totalCostUsd: aggregate.total_cost_usd,
      totalDurationMs: aggregate.total_duration_ms,
      messageCount: timestamps?.message_count || messages.length,
      durationSeconds: durationSec,
      summary: (parsed.summary as string) || '',
      category: (parsed.category as string) || 'other',
    })

    log.info({ conversationId, sentiment: parsed.sentiment_score, resolution: parsed.resolution_status }, 'Conversation stats generated')
  }
}

