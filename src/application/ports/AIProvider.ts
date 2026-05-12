/**
 * AI Provider port: re-exports from @supaproxy/providers.
 *
 * The ProviderPlugin interface from the package IS the port.
 * This file provides backward-compatible type aliases so existing
 * code doesn't need to change its imports.
 */
export type {
  AIMessage,
  AIContentBlock,
  AIToolSpec,
  AIUsage,
  AIResponse,
  ProviderPlugin as AIProvider,
} from '@supaproxy/providers'
