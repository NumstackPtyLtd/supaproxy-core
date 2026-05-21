import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockOrgRepo } from '../../__tests__/mocks.js'
import { RefreshOAuthTokenUseCase } from './RefreshOAuthTokenUseCase.js'
import type { OAuthCredentialPort } from './OAuthCredentialService.js'

function mockCredentialPort(): OAuthCredentialPort {
  return {
    resolveCredentials: vi.fn().mockResolvedValue({ clientId: 'cid-1', clientSecret: 'csec-1' }),
    resolveOAuthConfig: vi.fn().mockResolvedValue({
      authorizeUrl: 'https://auth.example.com/authorize',
      tokenUrl: 'https://auth.example.com/token',
      scopes: ['read'],
    }),
  }
}

describe('RefreshOAuthTokenUseCase', () => {
  let orgRepo: ReturnType<typeof mockOrgRepo>
  let credentialPort: OAuthCredentialPort
  let useCase: RefreshOAuthTokenUseCase

  beforeEach(() => {
    orgRepo = mockOrgRepo()
    credentialPort = mockCredentialPort()
    useCase = new RefreshOAuthTokenUseCase(orgRepo, credentialPort)
    vi.mocked(orgRepo.getFirstOrgId).mockResolvedValue('org-1')
    vi.mocked(orgRepo.findSetting).mockResolvedValue({ id: 's-1', key_name: 'test-plugin_refresh_token', value: 'rt-old', is_secret: true })
  })

  it('refreshes token and stores new access token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ access_token: 'at-new', refresh_token: 'rt-new' }),
    }))

    const result = await useCase.execute('test-plugin')

    expect(result.refreshed).toBe(true)
    expect(orgRepo.upsertSetting).toHaveBeenCalledWith(expect.any(String), 'org-1', 'test-plugin_access_token', 'at-new', true)
    expect(orgRepo.upsertSetting).toHaveBeenCalledWith(expect.any(String), 'org-1', 'test-plugin_refresh_token', 'rt-new', true)

    vi.unstubAllGlobals()
  })

  it('throws when plugin not found', async () => {
    vi.mocked(credentialPort.resolveOAuthConfig).mockResolvedValue(null)

    await expect(useCase.execute('test-plugin')).rejects.toThrow('plugin_not_found')
  })

  it('throws when no refresh token exists', async () => {
    vi.mocked(orgRepo.findSetting).mockResolvedValue(null)

    await expect(useCase.execute('test-plugin')).rejects.toThrow('no_refresh_token')
  })

  it('throws when token endpoint returns error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('unauthorized'),
    }))

    await expect(useCase.execute('test-plugin')).rejects.toThrow('refresh_failed')

    vi.unstubAllGlobals()
  })
})
