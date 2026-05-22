import type { ConversationRepository } from '../../domain/conversation/repository.js'
import type { ProviderPlugin } from '@supaproxy/providers'
import { generateId } from '../../domain/shared/EntityId.js'
import { DEFAULT_STATS_ANALYSIS_MAX_TOKENS, DEFAULT_SENTIMENT_SCORE } from '../../defaults.js'
import { buildAnalysisPrompt } from '../../prompts.js'
import pino from 'pino'

const log = pino({ name: 'stats-generator' })

export async function generateStats(
  conversationId: string,
  conversationRepo: ConversationRepository,
  resolveProvider: (providerType: string | null) => Promise<{ provider: ProviderPlugin; apiKey: string } | null>,
): Promise<void> {
  const existing = await conversationRepo.findStats(conversationId)
  let statsId: string
  if (existing) {
    if (existing.stats_status === 'complete') return
    statsId = existing.id
  } else {
    statsId = generateId()
    await conversationRepo.createStats(statsId, conversationId)
  }

  try {
    const messages = await conversationRepo.findMessages(conversationId)
    if (messages.length === 0) {
      await conversationRepo.updateStatsStatus(statsId, 'failed')
      return
    }

    const aggregate = await conversationRepo.getAggregateData(conversationId)
    const timestamps = await conversationRepo.getTimestamps(conversationId)
    const providerInfo = await conversationRepo.getWorkspaceProviderInfo(conversationId)

    if (!providerInfo) {
      await conversationRepo.updateStatsStatus(statsId, 'failed')
      return
    }

    const resolved = await resolveProvider(providerInfo.provider_type)
    if (!resolved) {
      await conversationRepo.updateStatsStatus(statsId, 'failed')
      return
    }
    const { provider, apiKey } = resolved
    const model = providerInfo.model

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

    const parsed = parseAnalysis(analysisText, conversationId)

    await conversationRepo.updateStatsComplete(statsId, {
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
  } catch (err) {
    await conversationRepo.updateStatsStatus(statsId, 'failed')
    log.error({ conversationId, error: (err as Error).message }, 'Stats generation failed')
  }
}

function parseAnalysis(analysisText: string, conversationId: string): Record<string, unknown> {
  let text = analysisText.trim()
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim()
  }
  try {
    return JSON.parse(text)
  } catch (parseErr) {
    log.error({ conversationId, error: (parseErr as Error).message }, 'Failed to parse stats analysis JSON')
    return { sentiment_score: DEFAULT_SENTIMENT_SCORE, resolution_status: 'unresolved', summary: '', category: 'other', compliance_violations: [], knowledge_gaps: [], fraud_indicators: [], tools_used: [] }
  }
}
