import type { ConversationRepository } from '../../domain/conversation/repository.js'
import type { OrganisationRepository } from '../../domain/organisation/repository.js'
import type { QueueService } from '../ports/QueueService.js'
import type { registry as ProviderRegistryType, ProviderPlugin } from '@supaproxy/providers'
import type { ConsumerPosterRegistry, ColdMessageTarget } from '../ports/ConsumerPoster.js'
import { generateId } from '../../domain/shared/EntityId.js'
import { DEFAULT_COLD_MESSAGE_MAX_TOKENS, DEFAULT_STATS_ANALYSIS_MAX_TOKENS } from '../../defaults.js'
import { buildColdMessagePrompt, DEFAULT_COLD_FALLBACK_MESSAGE, buildAnalysisPrompt } from '../../prompts.js'
import pino from 'pino'

const log = pino({ name: 'lifecycle-use-case' })

export class LifecycleUseCase {
  constructor(
    private readonly conversationRepo: ConversationRepository,
    private readonly orgRepo: OrganisationRepository,
    private readonly queueService: QueueService,
    private readonly providerRegistry: typeof ProviderRegistryType,
    private readonly posterRegistry: ConsumerPosterRegistry,
  ) {}

  async runLifecycleScan(): Promise<void> {
    const coldConvos = await this.conversationRepo.findColdTransitionCandidates()
    if (coldConvos.length > 0) {
      const ids = coldConvos.map(c => c.id)
      await this.conversationRepo.batchTransitionToCold(ids)
      for (const c of coldConvos) {
        await this.queueService.addColdMessage({
          conversationId: c.id,
          consumerType: c.consumer_type,
          channel: c.channel,
          externalThreadId: c.external_thread_id,
        })
      }
    }

    const closedIds = await this.conversationRepo.findCloseTransitionCandidates()
    if (closedIds.length > 0) {
      await this.conversationRepo.batchTransitionToClosed(closedIds)
      for (const id of closedIds) {
        await this.queueService.addStatsJob(id)
      }
    }
  }

  async sendColdMessage(target: ColdMessageTarget): Promise<void> {
    const message = await this.generateColdMessage(target.conversationId)
      || DEFAULT_COLD_FALLBACK_MESSAGE
    await this.posterRegistry.post(target, message)
  }

  async generateStats(conversationId: string): Promise<void> {
    const existing = await this.conversationRepo.findStats(conversationId)
    let statsId: string
    if (existing) {
      if (existing.stats_status === 'complete') return
      statsId = existing.id
    } else {
      statsId = generateId()
      await this.conversationRepo.createStats(statsId, conversationId)
    }

    try {
      const messages = await this.conversationRepo.findMessages(conversationId)
      if (messages.length === 0) {
        await this.conversationRepo.updateStatsStatus(statsId, 'failed')
        return
      }

      const aggregate = await this.conversationRepo.getAggregateData(conversationId)
      const timestamps = await this.conversationRepo.getTimestamps(conversationId)
      const model = await this.conversationRepo.getWorkspaceModel(conversationId)

      if (!model) {
        await this.conversationRepo.updateStatsStatus(statsId, 'failed')
        return
      }

      const orgSettings = await this.orgRepo.getSettingValues(['ai_api_key', 'ai_provider_type'])
      const apiKey = orgSettings['ai_api_key']
      const providerType = orgSettings['ai_provider_type'] || (() => { throw new Error('No AI provider configured') })()
      if (!apiKey) {
        await this.conversationRepo.updateStatsStatus(statsId, 'failed')
        return
      }
      const provider = this.providerRegistry.get(providerType)

      const durationSec = timestamps?.first_message_at && timestamps?.closed_at
        ? Math.round((new Date(timestamps.closed_at).getTime() - new Date(timestamps.first_message_at).getTime()) / 1000)
        : 0

      const transcript = messages.map(m => `${m.role}: ${m.content}`).join('\n\n')
      const analysisText = await provider.createSimpleMessage({
        apiKey,
        model,
        maxTokens: DEFAULT_STATS_ANALYSIS_MAX_TOKENS,
        prompt: buildAnalysisPrompt(transcript),
      })

      let text = analysisText.trim()
      if (text.startsWith('```')) {
        text = text.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim()
      }
      const parsed = JSON.parse(text)

      await this.conversationRepo.updateStatsComplete(statsId, {
        sentimentScore: parsed.sentiment_score || 3,
        resolutionStatus: parsed.resolution_status || 'unresolved',
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
        summary: parsed.summary || '',
        category: parsed.category || 'other',
      })

      log.info({ conversationId, sentiment: parsed.sentiment_score, resolution: parsed.resolution_status }, 'Conversation stats generated')
    } catch (err) {
      await this.conversationRepo.updateStatsStatus(statsId, 'failed')
      log.error({ conversationId, error: (err as Error).message }, 'Stats generation failed')
    }
  }

  private async generateColdMessage(conversationId: string): Promise<string> {
    try {
      const messages = await this.conversationRepo.findMessages(conversationId)
      if (messages.length === 0) return ''

      const coldSettings = await this.orgRepo.getSettingValues(['ai_api_key', 'ai_provider_type'])
      const apiKey = coldSettings['ai_api_key']
      const providerType = coldSettings['ai_provider_type'] || (() => { throw new Error('No AI provider configured') })()
      if (!apiKey) return ''

      const model = await this.conversationRepo.getWorkspaceModel(conversationId)
      if (!model) return ''

      const provider = this.providerRegistry.get(providerType)
      const transcript = messages.slice(-6).map(m => `${m.role}: ${m.content}`).join('\n\n')
      return provider.createSimpleMessage({
        apiKey,
        model,
        maxTokens: DEFAULT_COLD_MESSAGE_MAX_TOKENS,
        prompt: buildColdMessagePrompt(transcript),
      })
    } catch (err) {
      log.warn({ conversationId, error: (err as Error).message }, 'Could not generate cold message')
      return ''
    }
  }

}
