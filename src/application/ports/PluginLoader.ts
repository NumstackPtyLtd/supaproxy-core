import type { PluginMetadata } from '../../domain/guardrail/installedGuardrailRepository.js'

export interface LoadedPlugin {
  plugin_id: string
  metadata: PluginMetadata
  instance: unknown // GuardrailPlugin | ExecutionRailPlugin | RetrievalRailPlugin
}

export interface PluginLoader {
  load(packageName: string): Promise<LoadedPlugin | null>
}
