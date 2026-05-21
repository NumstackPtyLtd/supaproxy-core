/**
 * Startup routines: consumer boot, lifecycle workers.
 *
 * Separated from app creation so the cloud overlay can
 * hook into the startup sequence.
 */
import pino from 'pino'
import type { Container } from './container.js'
import type { IncomingMessage, Workspace } from '@supaproxy/consumers'
import type { QueueConfig } from './application/ports/QueueService.js'
import type { ColdMessageTarget } from './application/ports/ConsumerPoster.js'
import {
  QUEUE_LIFECYCLE, QUEUE_COLD_MESSAGES, QUEUE_CONVERSATION_STATS,
  LIFECYCLE_SCAN_INTERVAL_MS, COLD_MESSAGE_CONCURRENCY, STATS_WORKER_CONCURRENCY,
} from './defaults.js'

const log = pino({ name: 'startup' })

/**
 * Auto-start all registered consumers that have org-level credentials configured.
 * Iterates the plugin registry. No consumer-specific logic here.
 *
 * Message routing strategy (via entry_points table):
 * 1. Look up entry_point for the incoming channel
 * 2. If direct = true, execute against the bound workspace
 * 3. Otherwise (non-direct or no entry_point), route through the receptionist
 */
export async function startConsumers(container: Container): Promise<void> {
  const orgId = await container.orgRepo.getFirstOrgId()

  for (const plugin of container.consumerRegistry.list()) {
    if (!plugin.capabilities.orgCredentials) continue

    try {
      // Collect credentials from org settings using the plugin's configSchema
      const credentials: Record<string, string> = {}
      let hasAll = true

      for (const field of plugin.configSchema.fields) {
        const key = `${plugin.type}_${field.name}`
        const value = await container.orgRepo.getSettingValue(key)
        if (value) {
          credentials[field.name] = value
        } else if (field.required) {
          hasAll = false
          break
        }
      }

      if (!hasAll) {
        log.info({ type: plugin.type }, `${plugin.name} not configured. Set credentials in Settings > Integrations`)
        continue
      }

      // Auto-activate integration record for this consumer type
      if (orgId) {
        await container.manageIntegrationUseCase.activate(orgId, plugin.type)
      }

      await plugin.start({
        onMessage: async (msg: IncomingMessage) => {
          // Resolve routing via entry_points
          const routing = await container.manageEntryPointUseCase.resolveRouting(msg.consumerType, msg.channel)

          if (routing.mode === 'direct' && routing.workspaceId) {
            const result = await container.executeQueryUseCase.execute(routing.workspaceId, msg.query, {
              consumerType: msg.consumerType,
              channel: msg.channel,
              userId: msg.userId,
              userName: msg.userName,
              sessionId: msg.threadId,
            })
            return { answer: result.answer, conversationId: result.conversationId || '' }
          }

          const routingOrgId = routing.orgId || orgId
          if (routingOrgId) {
            const result = await container.routeMessageUseCase.execute({
              orgId: routingOrgId,
              query: msg.query,
              consumerType: msg.consumerType,
              entryPoint: msg.channel,
              userId: msg.userId,
              userName: msg.userName,
            })
            return { answer: result.answer, conversationId: result.conversationId }
          }

          return { answer: 'No organisation configured. Please complete setup.', conversationId: '' }
        },
        onError: (err: Error) => log.error({ type: plugin.type, error: err.message }, 'Consumer error'),
        logger: log,
        getWorkspaceForChannel: async (_channelId: string): Promise<Workspace | null> => null,
      }, credentials)

      if (plugin.sendMessage) {
        const sendFn = plugin.sendMessage.bind(plugin)
        container.posterRegistry.register(plugin.type, async (target, text) => {
          const threadTs = target.externalThreadId?.split(':')[1]
          if (target.channel && threadTs) await sendFn(target.channel, text, threadTs)
        })
      }

      log.info({ type: plugin.type }, `${plugin.name} consumer started`)
    } catch (err) {
      log.warn({ type: plugin.type, error: (err as Error).message }, `${plugin.name} consumer failed. Server continues without it`)
    }
  }
}

export function buildQueueConfigs(container: Container): QueueConfig[] {
  return [
    {
      name: QUEUE_LIFECYCLE,
      scheduler: { every: LIFECYCLE_SCAN_INTERVAL_MS, jobName: 'lifecycle-scan' },
      handler: async () => { await container.lifecycleUseCase.runLifecycleScan() },
    },
    {
      name: QUEUE_COLD_MESSAGES,
      concurrency: COLD_MESSAGE_CONCURRENCY,
      handler: async (data) => {
        await container.lifecycleUseCase.sendColdMessage(data as unknown as ColdMessageTarget)
      },
    },
    {
      name: QUEUE_CONVERSATION_STATS,
      concurrency: STATS_WORKER_CONCURRENCY,
      handler: async (data) => {
        await container.lifecycleUseCase.generateStats(data.conversationId as string)
      },
    },
  ]
}

export async function startWorkers(container: Container): Promise<void> {
  const configs = buildQueueConfigs(container)
  await container.queueService.startWorkers(configs)
}
