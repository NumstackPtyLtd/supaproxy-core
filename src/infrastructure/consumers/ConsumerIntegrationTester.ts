import type { IntegrationTester, IntegrationTestResult } from '../../application/ports/IntegrationTester.js'
import type { registry as ConsumerRegistryType } from '@supaproxy/consumers'

/**
 * Delegates integration testing to the consumer plugin's validateCredentials.
 * No consumer-specific logic; the plugin knows how to test its own credentials.
 */
export class ConsumerIntegrationTester implements IntegrationTester {
  constructor(private readonly registry: typeof ConsumerRegistryType) {}

  supports(type: string): boolean {
    return this.registry.has(type)
  }

  async test(type: string, credentials: Record<string, string>): Promise<IntegrationTestResult> {
    if (!this.registry.has(type)) {
      return { ok: false, error: `Unknown consumer type: ${type}` }
    }

    const plugin = this.registry.get(type)
    const result = await plugin.validateCredentials(credentials)

    if (!result.ok) return { ok: false, error: result.error }
    return { ok: true, detail: result.detail }
  }
}
