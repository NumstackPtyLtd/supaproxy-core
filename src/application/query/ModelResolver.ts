import type { ProviderPlugin } from '@supaproxy/providers'

/** Sentinel meaning "let the platform choose the provider's default model". */
export const AUTO_MODEL = 'auto'

/**
 * Resolve a workspace's configured model to a concrete model id.
 *
 * An explicit model is used as-is. 'auto' (or an empty value) resolves to the
 * provider's declared default model, falling back to its first declared model.
 * Returns null only when the provider declares no models.
 */
export function resolveModel(provider: ProviderPlugin, workspaceModel: string | null): string | null {
  if (workspaceModel && workspaceModel !== AUTO_MODEL) return workspaceModel
  const fallback = provider.models.find(m => m.default) ?? provider.models[0]
  return fallback?.id ?? null
}
