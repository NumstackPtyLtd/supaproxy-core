/**
 * Startup routines — consumer boot, lifecycle workers.
 *
 * Separated from app creation so the cloud overlay can
 * hook into the startup sequence.
 */
import pino from 'pino'
import type { Container } from './container.js'
import type { IncomingMessage, Workspace } from '@supaproxy/consumers'

const log = pino({ name: 'startup' })

/**
 * Auto-start all registered consumers that have org-level credentials configured.
 * Iterates the plugin registry — no consumer-specific logic here.
 *
 * Channel-based consumers (Slack) use direct workspace lookup via channel bindings.
 * DM-based consumers (WhatsApp, SMS) use the routing layer (RouteMessageUseCase)
 * to resolve the target workspace via the receptionist pattern.
 */
export async function startConsumers(container: Container): Promise<void> {
  // Resolve org_id once for routing (single-tenant)
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
        log.info({ type: plugin.type }, `${plugin.name} not configured — set credentials in Settings > Integrations`)
        continue
      }

      const getWorkspace = async (channelId: string): Promise<Workspace | null> => {
        const consumers = await container.workspaceRepo.findConsumersByType(plugin.type)
        for (const row of consumers) {
          const cfg = typeof row.config === 'string' ? JSON.parse(row.config) : row.config
          if ((cfg.channels || []).includes(channelId)) return { id: row.workspace_id, name: '' }
        }
        return null
      }

      const useRouting = !plugin.capabilities.channels && orgId

      await plugin.start({
        onMessage: async (msg: IncomingMessage) => {
          if (useRouting) {
            // DM-based consumer: route via receptionist pattern
            const result = await container.routeMessageUseCase.execute({
              orgId: orgId!,
              query: msg.query,
              consumerType: msg.consumerType,
              entryPoint: msg.channel,
              userId: msg.userId,
              userName: msg.userName,
            })
            return { answer: result.answer, conversationId: result.conversationId }
          }

          // Channel-based consumer: direct workspace lookup
          const ws = await getWorkspace(msg.channel)
          const workspaceId = ws?.id || msg.channel

          const result = await container.executeQueryUseCase.execute(workspaceId, msg.query, {
            consumerType: msg.consumerType,
            channel: msg.channel,
            userId: msg.userId,
            userName: msg.userName,
            sessionId: msg.threadId,
          })
          return { answer: result.answer, conversationId: result.conversationId || '' }
        },
        onError: (err: Error) => log.error({ type: plugin.type, error: err.message }, 'Consumer error'),
        logger: log,
        getWorkspaceForChannel: getWorkspace,
      }, credentials)

      if (plugin.sendMessage) {
        const sendFn = plugin.sendMessage.bind(plugin)
        container.posterRegistry.register(plugin.type, async (target, text) => {
          const threadTs = target.externalThreadId?.split(':')[1]
          if (target.channel && threadTs) await sendFn(target.channel, text, threadTs)
        })
      }

      log.info({ type: plugin.type, routing: useRouting ? 'receptionist' : 'channel' }, `${plugin.name} consumer started`)
    } catch (err) {
      log.warn({ type: plugin.type, error: (err as Error).message }, `${plugin.name} consumer failed — server continues without it`)
    }
  }
}

export async function startWorkers(container: Container): Promise<void> {
  await container.queueService.startWorkers(container.lifecycleUseCase)
}
