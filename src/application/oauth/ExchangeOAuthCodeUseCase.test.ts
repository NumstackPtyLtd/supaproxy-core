import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockOrgRepo } from '../../__tests__/mocks.js'
import { ExchangeOAuthCodeUseCase } from './ExchangeOAuthCodeUseCase.js'
import type { OAuthCredentialPort } from './OAuthCredentialService.js'

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

describe('ExchangeOAuthCodeUseCase', () => {
  let orgRepo: ReturnType<typeof mockOrgRepo>
  let credentialPort: OAuthCredentialPort
  let useCase: ExchangeOAuthCodeUseCase
  const dashboardUrl = 'https://dashboard.example.com'

  beforeEach(() => {
    orgRepo = mockOrgRepo()
    credentialPort = mockCredentialPort()
    useCase = new ExchangeOAuthCodeUseCase(orgRepo, credentialPort, dashboardUrl)
    vi.mocked(orgRepo.getFirstOrgId).mockResolvedValue('org-1')
  })

  it('exchanges code for tokens and stores them', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ access_token: 'at-1', refresh_token: 'rt-1' }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([{ id: 'res-1', name: 'Site', url: 'https://site.example.com' }]) }),
    )

    const result = await useCase.execute('auth-code-123', 'test-plugin:nonce-1')

    expect(result.pluginId).toBe('test-plugin')
    expect(result.redirectUrl).toContain('oauth=success')
    expect(orgRepo.upsertSetting).toHaveBeenCalledWith(expect.any(String), 'org-1', 'test-plugin_access_token', 'at-1', true)
    expect(orgRepo.upsertSetting).toHaveBeenCalledWith(expect.any(String), 'org-1', 'test-plugin_refresh_token', 'rt-1', true)
    expect(orgRepo.upsertSetting).toHaveBeenCalledWith(expect.any(String), 'org-1', 'test-plugin_resource_id', 'res-1', false)

    vi.unstubAllGlobals()
  })

  it('throws when plugin not found', async () => {
    vi.mocked(credentialPort.resolveOAuthConfig).mockResolvedValue(null)

    await expect(useCase.execute('code', 'test-plugin:nonce')).rejects.toThrow('plugin_not_found')

    vi.unstubAllGlobals()
  })

  it('throws when no org exists', async () => {
    vi.mocked(orgRepo.getFirstOrgId).mockResolvedValue(null)

    await expect(useCase.execute('code', 'test-plugin:nonce')).rejects.toThrow('no_org')

    vi.unstubAllGlobals()
  })

  it('throws when credentials are missing', async () => {
    vi.mocked(credentialPort.resolveCredentials).mockResolvedValue(null)

    await expect(useCase.execute('code', 'test-plugin:nonce')).rejects.toThrow('no_credentials')

    vi.unstubAllGlobals()
  })

  it('throws when token exchange fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400, text: () => Promise.resolve('bad request') }))

    await expect(useCase.execute('bad-code', 'test-plugin:nonce')).rejects.toThrow('Token exchange failed')

    vi.unstubAllGlobals()
  })
})
