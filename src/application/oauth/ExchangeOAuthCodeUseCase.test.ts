import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockOrgRepo } from '../../__tests__/mocks.js'
import { ExchangeOAuthCodeUseCase } from './ExchangeOAuthCodeUseCase.js'
import type { OAuthCredentialPort } from './OAuthCredentialService.js'
import type { OAuthHttpClient } from '../ports/OAuthHttpClient.js'

function mockCredentialPort(): OAuthCredentialPort {
  return {
    resolveCredentials: vi.fn().mockResolvedValue({ clientId: 'cid-1', clientSecret: 'csec-1' }),
    resolveOAuthConfig: vi.fn().mockResolvedValue({
      authorizeUrl: 'https://auth.example.com/authorize',
      tokenUrl: 'https://auth.example.com/token',
      resourcesUrl: 'https://api.example.com/resources',
      scopes: ['read', 'write'],
    }),
  }
}

function mockOAuthHttp(): OAuthHttpClient {
  return {
    exchangeToken: vi.fn().mockResolvedValue({ access_token: 'at-1', refresh_token: 'rt-1' }),
    discoverResources: vi.fn().mockResolvedValue([{ id: 'res-1', name: 'Site', url: 'https://site.example.com' }]),
  }
}

describe('ExchangeOAuthCodeUseCase', () => {
  let orgRepo: ReturnType<typeof mockOrgRepo>
  let credentialPort: OAuthCredentialPort
  let oauthHttp: OAuthHttpClient
  let useCase: ExchangeOAuthCodeUseCase
  const dashboardUrl = 'https://dashboard.example.com'
  const redirectUri = 'https://api.example.com/api/oauth/callback'

  beforeEach(() => {
    orgRepo = mockOrgRepo()
    credentialPort = mockCredentialPort()
    oauthHttp = mockOAuthHttp()
    useCase = new ExchangeOAuthCodeUseCase(orgRepo, credentialPort, oauthHttp, dashboardUrl)
    vi.mocked(orgRepo.getFirstOrgId).mockResolvedValue('org-1')
  })

  it('exchanges code for tokens and stores them', async () => {
    const result = await useCase.execute('auth-code-123', 'test-plugin:nonce-1', redirectUri)

    expect(result.pluginId).toBe('test-plugin')
    expect(result.redirectUrl).toContain('oauth=success')
    expect(oauthHttp.exchangeToken).toHaveBeenCalledWith(expect.objectContaining({
      grantType: 'authorization_code',
      code: 'auth-code-123',
      redirectUri,
    }))
    expect(orgRepo.upsertSetting).toHaveBeenCalledWith(expect.any(String), 'org-1', 'test-plugin_access_token', 'at-1', true)
    expect(orgRepo.upsertSetting).toHaveBeenCalledWith(expect.any(String), 'org-1', 'test-plugin_refresh_token', 'rt-1', true)
    expect(orgRepo.upsertSetting).toHaveBeenCalledWith(expect.any(String), 'org-1', 'test-plugin_resource_id', 'res-1', false)
  })

  it('throws when plugin not found', async () => {
    vi.mocked(credentialPort.resolveOAuthConfig).mockResolvedValue(null)
    await expect(useCase.execute('code', 'test-plugin:nonce', redirectUri)).rejects.toThrow('not found')
  })

  it('throws when no org exists', async () => {
    vi.mocked(orgRepo.getFirstOrgId).mockResolvedValue(null)
    await expect(useCase.execute('code', 'test-plugin:nonce', redirectUri)).rejects.toThrow('No organisation configured')
  })

  it('throws when credentials are missing', async () => {
    vi.mocked(credentialPort.resolveCredentials).mockResolvedValue(null)
    await expect(useCase.execute('code', 'test-plugin:nonce', redirectUri)).rejects.toThrow('No OAuth credentials configured')
  })

  it('throws when token exchange fails', async () => {
    vi.mocked(oauthHttp.exchangeToken).mockRejectedValue(new Error('Token exchange failed: 400'))
    await expect(useCase.execute('bad-code', 'test-plugin:nonce', redirectUri)).rejects.toThrow('Token exchange failed')
  })
})
