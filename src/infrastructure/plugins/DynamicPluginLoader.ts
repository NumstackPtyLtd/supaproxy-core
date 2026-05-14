import type { PluginLoader, LoadedPlugin } from '../../application/ports/PluginLoader.js'
import pino from 'pino'

const log = pino({ name: 'plugin-loader' })

/**
 * Loads guardrail plugins from npm packages via dynamic import.
 *
 * The package must be pre-installed on the server (in node_modules).
 * It must export a default or named `plugin` export that implements
 * one of the guardrail plugin interfaces.
 */
export class DynamicPluginLoader implements PluginLoader {
  async load(packageName: string): Promise<LoadedPlugin | null> {
    try {
      const mod = await import(packageName)
      const instance = mod.default || mod.plugin
      if (!instance || typeof instance !== 'object') {
        log.warn({ packageName }, 'Package does not export a plugin instance')
        return null
      }

      if (!instance.id || !instance.name || !instance.stage) {
        log.warn({ packageName }, 'Plugin instance missing required fields (id, name, stage)')
        return null
      }

      return {
        plugin_id: instance.id,
        metadata: {
          name: instance.name,
          description: instance.description || '',
          author: instance.author || '',
          version: instance.version || '0.0.0',
          stage: instance.stage,
          configSchema: instance.configSchema || { fields: [] },
        },
        instance,
      }
    } catch (err) {
      log.error({ packageName, error: (err as Error).message }, 'Failed to load plugin package')
      return null
    }
  }
}
