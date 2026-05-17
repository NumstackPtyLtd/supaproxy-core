import { describe, it, expect, vi } from 'vitest'
import { mockModelRepo, mockOrgRepo, mockProviderRegistry } from '../../__tests__/mocks.js'
import { GetModelsUseCase } from './GetModelsUseCase.js'

describe('GetModelsUseCase', () => {
  it('returns registry models merged with DB models', async () => {
    const modelRepo = mockModelRepo()
    const orgRepo = mockOrgRepo()
    const registry = mockProviderRegistry([
      { type: 'anthropic', models: [{ id: 'claude-sonnet', label: 'Claude Sonnet', default: true }] },
      { type: 'openai', models: [{ id: 'gpt-4o', label: 'GPT-4o', default: true }] },
    ])
    const uc = new GetModelsUseCase(modelRepo, orgRepo, registry)

    vi.mocked(orgRepo.getSettingValue).mockResolvedValue(null)
    vi.mocked(modelRepo.listAll).mockResolvedValue([
      { id: 'custom-model', label: 'Custom Model', is_default: false },
    ])

    const result = await uc.execute()

    expect(result).toHaveLength(3)
    expect(result.map(m => m.id)).toEqual(['claude-sonnet', 'gpt-4o', 'custom-model'])
    expect(result[0].provider).toBe('anthropic')
    expect(result[1].provider).toBe('openai')
  })

  it('deduplicates registry and DB models', async () => {
    const modelRepo = mockModelRepo()
    const orgRepo = mockOrgRepo()
    const registry = mockProviderRegistry([
      { type: 'anthropic', models: [{ id: 'claude-sonnet', label: 'Claude Sonnet' }] },
    ])
    const uc = new GetModelsUseCase(modelRepo, orgRepo, registry)

    vi.mocked(orgRepo.getSettingValue).mockResolvedValue(null)
    vi.mocked(modelRepo.listAll).mockResolvedValue([
      { id: 'claude-sonnet', label: 'Claude Sonnet (DB)', is_default: false },
    ])

    const result = await uc.execute()

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('claude-sonnet')
  })

  it('marks default model from org settings', async () => {
    const modelRepo = mockModelRepo()
    const orgRepo = mockOrgRepo()
    const registry = mockProviderRegistry([
      { type: 'openai', models: [
        { id: 'gpt-4o', label: 'GPT-4o' },
        { id: 'gpt-4o-mini', label: 'GPT-4o Mini' },
      ] },
    ])
    const uc = new GetModelsUseCase(modelRepo, orgRepo, registry)

    vi.mocked(orgRepo.getSettingValue).mockResolvedValue('gpt-4o-mini')
    vi.mocked(modelRepo.listAll).mockResolvedValue([])

    const result = await uc.execute()

    expect(result.find(m => m.id === 'gpt-4o')?.is_default).toBe(false)
    expect(result.find(m => m.id === 'gpt-4o-mini')?.is_default).toBe(true)
  })

  it('falls back to DB only when no registry', async () => {
    const modelRepo = mockModelRepo()
    const orgRepo = mockOrgRepo()
    const uc = new GetModelsUseCase(modelRepo, orgRepo)

    vi.mocked(orgRepo.getSettingValue).mockResolvedValue(null)
    vi.mocked(modelRepo.listAll).mockResolvedValue([
      { id: 'model-1', label: 'Model 1', is_default: false },
    ])

    const result = await uc.execute()

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('model-1')
  })
})
