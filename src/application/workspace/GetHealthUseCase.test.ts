import { describe, it, expect, vi } from 'vitest'
import { mockOrgRepo, mockWorkspaceRepo, mockProviderRegistry } from '../../__tests__/mocks.js'
import { GetHealthUseCase } from './GetHealthUseCase.js'

describe('GetHealthUseCase', () => {
  it('executePublic returns status ok', async () => {
    const orgRepo = mockOrgRepo()
    const wsRepo = mockWorkspaceRepo()
    const uc = new GetHealthUseCase(orgRepo, wsRepo)

    const result = await uc.executePublic()

    expect(result).toEqual({ status: 'ok' })
    expect(orgRepo.getSettingValue).not.toHaveBeenCalled()
    expect(wsRepo.getActiveWorkspaceCount).not.toHaveBeenCalled()
  })

  it('executeAuthenticated returns full details with ai_api_key', async () => {
    const orgRepo = mockOrgRepo()
    const wsRepo = mockWorkspaceRepo()
    const uc = new GetHealthUseCase(orgRepo, wsRepo)

    vi.mocked(orgRepo.getSettingValue).mockResolvedValue('sk-key-value')
    vi.mocked(wsRepo.getActiveWorkspaceCount).mockResolvedValue(3)
    vi.mocked(wsRepo.getConnectedConnectionCount).mockResolvedValue(2)
    vi.mocked(wsRepo.getActiveConsumerCount).mockResolvedValue(1)

    const result = await uc.executeAuthenticated()

    expect(result).toEqual({
      status: 'ok',
      setup_complete: true,
      workspaces: 3,
      ai_configured: true,
      embedding_available: false,
      connections: 2,
      consumers: 1,
    })
  })

  it('detects provider-specific keys via registry', async () => {
    const orgRepo = mockOrgRepo()
    const wsRepo = mockWorkspaceRepo()
    const registry = mockProviderRegistry([
      { type: 'openai', models: [], supportsEmbedding: true },
    ])
    const uc = new GetHealthUseCase(orgRepo, wsRepo, registry)

    // No general key, but openai_api_key exists
    vi.mocked(orgRepo.getSettingValue).mockImplementation(async (key: string) => {
      if (key === 'openai_api_key') return 'sk-openai'
      return null
    })
    vi.mocked(wsRepo.getActiveWorkspaceCount).mockResolvedValue(1)
    vi.mocked(wsRepo.getConnectedConnectionCount).mockResolvedValue(0)
    vi.mocked(wsRepo.getActiveConsumerCount).mockResolvedValue(0)

    const result = await uc.executeAuthenticated()

    expect(result.ai_configured).toBe(true)
    expect(result.embedding_available).toBe(true)
  })
})
