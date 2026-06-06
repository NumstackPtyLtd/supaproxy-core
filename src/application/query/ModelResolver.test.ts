import { describe, it, expect } from 'vitest'
import { resolveModel, AUTO_MODEL } from './ModelResolver.js'
import type { ProviderPlugin } from '@supaproxy/providers'

function providerWith(models: Array<{ id: string; label: string; default?: boolean }>): ProviderPlugin {
  return { models } as ProviderPlugin
}

describe('resolveModel', () => {
  const provider = providerWith([
    { id: 'model-a', label: 'A' },
    { id: 'model-b', label: 'B', default: true },
  ])

  it('returns an explicit model unchanged', () => {
    expect(resolveModel(provider, 'model-a')).toBe('model-a')
  })

  it("resolves 'auto' to the provider default model", () => {
    expect(resolveModel(provider, AUTO_MODEL)).toBe('model-b')
  })

  it('resolves empty or null to the provider default model', () => {
    expect(resolveModel(provider, null)).toBe('model-b')
    expect(resolveModel(provider, '')).toBe('model-b')
  })

  it('falls back to the first model when none is flagged default', () => {
    const p = providerWith([{ id: 'only', label: 'Only' }])
    expect(resolveModel(p, AUTO_MODEL)).toBe('only')
  })

  it('returns null when the provider declares no models', () => {
    expect(resolveModel(providerWith([]), AUTO_MODEL)).toBeNull()
  })
})
