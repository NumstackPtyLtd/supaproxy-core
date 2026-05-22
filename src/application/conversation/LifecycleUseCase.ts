import type { ConversationRepository } from '../../domain/conversation/repository.js'
import type { OrganisationRepository } from '../../domain/organisation/repository.js'
import type { QueueService } from '../ports/QueueService.js'
import type { registry as ProviderRegistryType, ProviderPlugin } from '@supaproxy/providers'
import type { ConsumerPosterRegistry, ColdMessageTarget } from '../ports/ConsumerPoster.js'
import { DEFAULT_COLD_MESSAGE_MAX_TOKENS, QUEUE_COLD_MESSAGES, QUEUE_CONVERSATION_STATS, COLD_MESSAGE_TRANSCRIPT_LIMIT } from '../../defaults.js'
import { buildColdMessagePrompt, DEFAULT_COLD_FALLBACK_MESSAGE } from '../../prompts.js'
import { generateStats } from './StatsGenerator.js'
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
    return generateStats(conversationId, this.conversationRepo, (pt) => this.resolveOrgProvider(pt))
  }

  private async resolveOrgProvider(workspaceProviderType: string | null): Promise<{ provider: ProviderPlugin; apiKey: string } | null> {
    const orgSettings = await this.orgRepo.getSettingValues(['ai_provider_type'])
    const providerType = workspaceProviderType || orgSettings['ai_provider_type']
    if (!providerType) return null

    const keySettings = await this.orgRepo.getSettingValues([`${providerType}_api_key`, 'ai_api_key'])
    const apiKey = keySettings[`${providerType}_api_key`] || keySettings['ai_api_key'] || null
    if (!apiKey) return null

    const provider = this.providerRegistry.get(providerType)
    return { provider, apiKey }
  }

  private async generateColdMessage(conversationId: string): Promise<string> {
    try {
      const messages = await this.conversationRepo.findMessages(conversationId)
      if (messages.length === 0) return ''

      const providerInfo = await this.conversationRepo.getWorkspaceProviderInfo(conversationId)
      if (!providerInfo) return ''
      const resolved = await this.resolveOrgProvider(providerInfo.provider_type)
      if (!resolved) return ''
      const { provider, apiKey } = resolved
      const model = providerInfo.model
      const transcript = messages.slice(-COLD_MESSAGE_TRANSCRIPT_LIMIT).map(m => `${m.role}: ${m.content}`).join('\n\n')
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
