import { type GuardrailPlugin, ExecutionRailRegistry, RetrievalRailRegistry } from '@supaproxy/guardrails'
import type { WorkspaceRepository } from './domain/workspace/repository.js'
import type { GuardrailPolicyRepository } from './domain/guardrail/policyRepository.js'

export interface PluginRegistry<T = any> {
  list(): T[]
  has(id: string): boolean
  get(id: string): T
}
import pino from 'pino'

const log = pino({ name: 'guardrail-resolver' })

export type GuardrailInfo = { id: string; name: string; description: string; stage: string; source: 'core' | 'marketplace'; icon?: string; configSchema: { fields: Array<{ name: string; label: string; type: string; required?: boolean; placeholder?: string; helpText?: string; options?: Array<{ value: string; label: string }>; defaultValue?: string | boolean | number }> } }

/**
 * Resolves guardrail plugins, execution rails, and retrieval rails
 * for a given workspace based on enabled configs and org policies.
 *
 * Core only returns statically registered plugins. Cloud extends
 * listAvailableGuardrails with dynamically installed marketplace plugins.
 */
export function createGuardrailResolver(deps: {
  workspaceRepo: WorkspaceRepository
  guardrailPolicyRepo: GuardrailPolicyRepository
  guardrailRegistry: PluginRegistry
  executionCatalogue: PluginRegistry
  retrievalCatalogue: PluginRegistry
}) {
  const { workspaceRepo, guardrailPolicyRepo, guardrailRegistry, executionCatalogue, retrievalCatalogue } = deps

  async function getEnforcedPluginIds(workspaceId: string): Promise<string[]> {
    const ws = await workspaceRepo.findById(workspaceId)
    if (!ws?.org_id) return []

    const [mandatory, recommended, overrides] = await Promise.all([
      guardrailPolicyRepo.findMandatoryPlugins(ws.org_id),
      guardrailPolicyRepo.findRecommendedPlugins(ws.org_id),
      guardrailPolicyRepo.findOverridesForWorkspace(workspaceId),
    ])

    const overriddenPlugins = new Set(overrides.map(o => o.plugin_id))
    const enforced = [...mandatory]
    for (const pluginId of recommended) {
      if (!overriddenPlugins.has(pluginId)) enforced.push(pluginId)
    }
    return enforced
  }

  async function resolveGuardrails(workspaceId: string): Promise<GuardrailPlugin[]> {
    const configs = await workspaceRepo.findEnabledGuardrailConfigs(workspaceId)
    const enabledIds = new Set(configs.map(c => c.guardrail_id))

    const enforcedIds = await getEnforcedPluginIds(workspaceId)
    for (const id of enforcedIds) enabledIds.add(id)

    const plugins: GuardrailPlugin[] = []
    for (const id of enabledIds) {
      const factory = guardrailRegistry.has(id) ? () => {
        const proto = guardrailRegistry.get(id)
        return new (proto.constructor as new () => GuardrailPlugin)()
      } : null
      if (factory) plugins.push(factory())
    }
    return plugins
  }

  async function resolveExecutionRails(workspaceId: string): Promise<ExecutionRailRegistry | null> {
    const configs = await workspaceRepo.findEnabledGuardrailConfigs(workspaceId)
    const enabledIds = new Set(configs.map(c => c.guardrail_id))
    const enforcedIds = await getEnforcedPluginIds(workspaceId)
    for (const id of enforcedIds) enabledIds.add(id)

    const matchedPlugins = executionCatalogue.list().filter(p => enabledIds.has(p.id))
    if (matchedPlugins.length === 0) return null

    const reg = new ExecutionRailRegistry()
    for (const proto of matchedPlugins) {
      reg.register(new (proto.constructor as new () => typeof proto)())
    }
    reg.on((event) => {
      if (!event.result.allowed) {
        log.warn({ plugin: event.pluginId, tool: event.ctx.toolName, workspace: event.ctx.workspaceId, reason: event.result.reason }, 'Tool call blocked by execution rail')
      }
    })
    return reg
  }

  async function resolveRetrievalRails(workspaceId: string): Promise<RetrievalRailRegistry | null> {
    const configs = await workspaceRepo.findEnabledGuardrailConfigs(workspaceId)
    const enabledIds = new Set(configs.map(c => c.guardrail_id))
    const enforcedIds = await getEnforcedPluginIds(workspaceId)
    for (const id of enforcedIds) enabledIds.add(id)

    const matchedPlugins = retrievalCatalogue.list().filter(p => enabledIds.has(p.id))
    if (matchedPlugins.length === 0) return null

    const reg = new RetrievalRailRegistry()
    for (const proto of matchedPlugins) {
      reg.register(new (proto.constructor as new () => typeof proto)())
    }
    reg.on((event) => {
      log.warn({ plugin: event.pluginId, stripped: event.result.stripped }, 'Injection attempt detected in tool output')
    })
    return reg
  }

  const corePluginIds = new Set([
    ...guardrailRegistry.list().map(p => p.id),
    ...executionCatalogue.list().map(p => p.id),
    ...retrievalCatalogue.list().map(p => p.id),
  ])

  const toInfo = (p: { id: string; name: string; description: string; stage: string; icon?: string; configSchema: GuardrailInfo['configSchema'] }): GuardrailInfo => ({
    id: p.id, name: p.name, description: p.description, stage: p.stage, source: corePluginIds.has(p.id) ? 'core' : 'marketplace', icon: p.icon, configSchema: p.configSchema,
  })

  async function listAvailableGuardrails(_orgId: string): Promise<GuardrailInfo[]> {
    return [
      ...guardrailRegistry.list().map(toInfo),
      ...executionCatalogue.list().map(toInfo),
      ...retrievalCatalogue.list().map(toInfo),
    ]
  }

  return { resolveGuardrails, resolveExecutionRails, resolveRetrievalRails, listAvailableGuardrails, corePluginIds }
}
