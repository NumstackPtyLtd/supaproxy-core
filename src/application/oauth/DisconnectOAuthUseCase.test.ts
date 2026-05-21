import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockOrgRepo } from '../../__tests__/mocks.js'
import { DisconnectOAuthUseCase } from './DisconnectOAuthUseCase.js'

describe('DisconnectOAuthUseCase', () => {
  let orgRepo: ReturnType<typeof mockOrgRepo>
  let useCase: DisconnectOAuthUseCase

  beforeEach(() => {
    orgRepo = mockOrgRepo()
    useCase = new DisconnectOAuthUseCase(orgRepo)
    vi.mocked(orgRepo.getFirstOrgId).mockResolvedValue('org-1')
  })

  it('clears all OAuth settings for the plugin', async () => {
    vi.mocked(orgRepo.findSetting).mockImplementation(async (_orgId, key) => {
      if (key === 'test-plugin_access_token') return { id: 's-1', key_name: key, value: 'at', is_secret: true }
      if (key === 'test-plugin_refresh_token') return { id: 's-2', key_name: key, value: 'rt', is_secret: true }
      if (key === 'test-plugin_resource_id') return { id: 's-3', key_name: key, value: 'res', is_secret: false }
      if (key === 'test-plugin_resource_url') return { id: 's-4', key_name: key, value: 'url', is_secret: false }
      return null
    })

    const result = await useCase.execute('test-plugin')

    expect(result.disconnected).toBe(true)
    expect(orgRepo.upsertSetting).toHaveBeenCalledTimes(4)
    expect(orgRepo.upsertSetting).toHaveBeenCalledWith('s-1', 'org-1', 'test-plugin_access_token', '', false)
    expect(orgRepo.upsertSetting).toHaveBeenCalledWith('s-2', 'org-1', 'test-plugin_refresh_token', '', false)
  })

  it('skips settings that do not exist', async () => {
    vi.mocked(orgRepo.findSetting).mockResolvedValue(null)

    const result = await useCase.execute('test-plugin')

    expect(result.disconnected).toBe(true)
    expect(orgRepo.upsertSetting).not.toHaveBeenCalled()
  })

  it('throws when no org exists', async () => {
    vi.mocked(orgRepo.getFirstOrgId).mockResolvedValue(null)

    await expect(useCase.execute('test-plugin')).rejects.toThrow('no_org')
  })
})
