import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockOrgRepo } from '../../__tests__/mocks.js'
import { BuildOAuthAuthorizeUrlUseCase } from './BuildOAuthAuthorizeUrlUseCase.js'
import type { OAuthCredentialPort } from './OAuthCredentialService.js'

function mockCredentialPort(): OAuthCredentialPort {
  return {
    resolveCredentials: vi.fn().mockResolvedValue({ clientId: 'cid-1', clientSecret: 'csec-1' }),
    resolveOAuthConfig: vi.fn().mockResolvedValue({
      authorizeUrl: 'https://auth.example.com/authorize',
      tokenUrl: 'https://auth.example.com/token',
      scopes: ['read', 'write'],
      authorizeParams: { audience: 'api.example.com' },
    }),
  }
}

describe('BuildOAuthAuthorizeUrlUseCase', () => {
  let orgRepo: ReturnType<typeof mockOrgRepo>
  let credentialPort: OAuthCredentialPort
  let useCase: BuildOAuthAuthorizeUrlUseCase
  const redirectUri = 'https://api.example.com/api/oauth/callback'

  beforeEach(() => {
    orgRepo = mockOrgRepo()
    credentialPort = mockCredentialPort()
    useCase = new BuildOAuthAuthorizeUrlUseCase(orgRepo, credentialPort)
    vi.mocked(orgRepo.getFirstOrgId).mockResolvedValue('org-1')
  })

  it('builds an authorize URL with the provided redirect_uri', async () => {
    const url = await useCase.execute('test-plugin', redirectUri)
    const parsed = new URL(url)

    expect(parsed.origin + parsed.pathname).toBe('https://auth.example.com/authorize')
    expect(parsed.searchParams.get('redirect_uri')).toBe(redirectUri)
    expect(parsed.searchParams.get('client_id')).toBe('cid-1')
    expect(parsed.searchParams.get('scope')).toBe('read write')
    expect(parsed.searchParams.get('state')).toContain('test-plugin:')
    expect(parsed.searchParams.get('audience')).toBe('api.example.com')
  })

  it('throws when the OAuth config is not found', async () => {
    vi.mocked(credentialPort.resolveOAuthConfig).mockResolvedValue(null)
    await expect(useCase.execute('test-plugin', redirectUri)).rejects.toThrow('not found')
  })

  it('throws when no org exists', async () => {
    vi.mocked(orgRepo.getFirstOrgId).mockResolvedValue(null)
    await expect(useCase.execute('test-plugin', redirectUri)).rejects.toThrow('No organisation configured')
  })

  it('throws when credentials are missing', async () => {
    vi.mocked(credentialPort.resolveCredentials).mockResolvedValue(null)
    await expect(useCase.execute('test-plugin', redirectUri)).rejects.toThrow('OAuth credentials not configured')
  })
})
