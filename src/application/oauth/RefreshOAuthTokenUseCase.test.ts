import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockOrgRepo } from '../../__tests__/mocks.js'
import { RefreshOAuthTokenUseCase } from './RefreshOAuthTokenUseCase.js'
import type { OAuthCredentialPort } from './OAuthCredentialService.js'
import type { OAuthHttpClient } from '../ports/OAuthHttpClient.js'

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

function mockOAuthHttp(): OAuthHttpClient {
  return {
    exchangeToken: vi.fn().mockResolvedValue({ access_token: 'at-new', refresh_token: 'rt-new' }),
    discoverResources: vi.fn().mockResolvedValue([]),
  }
}

describe('RefreshOAuthTokenUseCase', () => {
  let orgRepo: ReturnType<typeof mockOrgRepo>
  let credentialPort: OAuthCredentialPort
  let oauthHttp: OAuthHttpClient
  let useCase: RefreshOAuthTokenUseCase

  beforeEach(() => {
    orgRepo = mockOrgRepo()
    credentialPort = mockCredentialPort()
    oauthHttp = mockOAuthHttp()
    useCase = new RefreshOAuthTokenUseCase(orgRepo, credentialPort, oauthHttp)
    vi.mocked(orgRepo.getFirstOrgId).mockResolvedValue('org-1')
    vi.mocked(orgRepo.findSetting).mockResolvedValue({ id: 's-1', key_name: 'test-plugin_refresh_token', value: 'rt-old', is_secret: true })
  })

  it('refreshes token and stores new access token', async () => {
    const result = await useCase.execute('test-plugin')

    expect(result.refreshed).toBe(true)
    expect(oauthHttp.exchangeToken).toHaveBeenCalledWith(expect.objectContaining({
      grantType: 'refresh_token',
      refreshToken: 'rt-old',
    }))
    expect(orgRepo.upsertSetting).toHaveBeenCalledWith(expect.any(String), 'org-1', 'test-plugin_access_token', 'at-new', true)
    expect(orgRepo.upsertSetting).toHaveBeenCalledWith(expect.any(String), 'org-1', 'test-plugin_refresh_token', 'rt-new', true)
  })

  it('throws when plugin not found', async () => {
    vi.mocked(credentialPort.resolveOAuthConfig).mockResolvedValue(null)
    await expect(useCase.execute('test-plugin')).rejects.toThrow('not found')
  })

  it('throws when no refresh token exists', async () => {
    vi.mocked(orgRepo.findSetting).mockResolvedValue(null)
    await expect(useCase.execute('test-plugin')).rejects.toThrow('No refresh token available')
  })

  it('throws when token exchange fails', async () => {
    vi.mocked(oauthHttp.exchangeToken).mockRejectedValue(new Error('Token exchange failed: 401'))
    await expect(useCase.execute('test-plugin')).rejects.toThrow('Token exchange failed')
  })
})
