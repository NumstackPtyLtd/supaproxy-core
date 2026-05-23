import type { ConversationRepository } from '../../domain/conversation/repository.js'
import type { OrganisationRepository } from '../../domain/organisation/repository.js'
import type { QueueService } from '../ports/QueueService.js'
import type { registry as ProviderRegistryType } from '@supaproxy/providers'
import type { ConsumerPosterRegistry, ColdMessageTarget } from '../ports/ConsumerPoster.js'
import { ConfigurationError } from '../../domain/shared/errors.js'
import { DEFAULT_COLD_MESSAGE_MAX_TOKENS, QUEUE_COLD_MESSAGES, QUEUE_CONVERSATION_STATS, COLD_MESSAGE_TRANSCRIPT_LIMIT } from '../../defaults.js'
import { buildColdMessagePrompt, DEFAULT_COLD_FALLBACK_MESSAGE } from '../../prompts.js'
import { resolveProvider } from '../query/ProviderResolver.js'
import type { StatsGenerator } from './StatsGenerator.js'
import pino from 'pino'

const log = pino({ name: 'lifecycle-use-case' })

export class LifecycleUseCase {
  constructor(
    private readonly conversationRepo: ConversationRepository,
    private readonly orgRepo: OrganisationRepository,
    private readonly queueService: QueueService,
    private readonly providerRegistry: typeof ProviderRegistryType,
    private readonly posterRegistry: ConsumerPosterRegistry,
    private readonly statsGenerator: StatsGenerator,
  ) {}

  async runLifecycleScan(): Promise<void> {
    const coldConvos = await this.conversationRepo.findColdTransitionCandidates()
    if (coldConvos.length > 0) {
      const ids = coldConvos.map(c => c.id)
      await this.conversationRepo.batchTransitionToCold(ids)
      for (const c of coldConvos) {
        await this.queueService.addJob(QUEUE_COLD_MESSAGES, 'send-cold-message', {
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
        await this.queueService.addJob(QUEUE_CONVERSATION_STATS, 'generate-stats', { conversationId: id })
      }
    }
  }

  async sendColdMessage(target: ColdMessageTarget): Promise<void> {
    const message = await this.generateColdMessage(target.conversationId)
      || DEFAULT_COLD_FALLBACK_MESSAGE
    await this.posterRegistry.post(target, message)
  }

  async generateStats(conversationId: string): Promise<void> {
    return this.statsGenerator.generate(conversationId)
  }

  private async resolveOrgProviderSafe(workspaceProviderType: string | null) {
    try {
      return await resolveProvider(this.orgRepo, this.providerRegistry, workspaceProviderType)
    } catch (err) {
      if (err instanceof ConfigurationError) return null
      throw err
    }
  }

  private async generateColdMessage(conversationId: string): Promise<string> {
    try {
      const messages = await this.conversationRepo.findMessages(conversationId)
      if (messages.length === 0) return ''

      const providerInfo = await this.conversationRepo.getWorkspaceProviderInfo(conversationId)
      if (!providerInfo) return ''
      const resolved = await this.resolveOrgProviderSafe(providerInfo.provider_type)
      if (!resolved) return ''
      const { provider, apiKey } = resolved
      const transcript = messages.slice(-COLD_MESSAGE_TRANSCRIPT_LIMIT).map(m => `${m.role}: ${m.content}`).join('\n\n')
      return provider.createSimpleMessage({
        apiKey,
        model: providerInfo.model,
        maxTokens: DEFAULT_COLD_MESSAGE_MAX_TOKENS,
        prompt: buildColdMessagePrompt(transcript),
      })
    } catch (err) {
      log.warn({ conversationId, error: (err as Error).message }, 'Could not generate cold message')
      return ''
    }
  }
}
