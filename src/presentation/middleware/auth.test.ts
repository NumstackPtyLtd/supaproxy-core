import { describe, it, expect, vi } from 'vitest'
import { Hono } from 'hono'
import { createRequireAuth, createOptionalAuth, type AuthEnv } from './auth.js'
import type { TokenService } from '../../application/ports/TokenService.js'

function mockTokenService(valid = true): TokenService {
  return {
    sign: vi.fn().mockReturnValue('mock-token'),
    verify: vi.fn().mockImplementation((token: string) => {
      if (!valid) return null
      if (token === 'valid-token') return { id: 'user-1', email: 'test@example.com', name: 'Test', role: 'admin', org_id: 'org-1' }
      return null
    }),
  }
}

describe('requireAuth', () => {
  it('returns 401 if no cookie present', async () => {
    const tokenService = mockTokenService()
    const requireAuth = createRequireAuth(tokenService)
    const app = new Hono()
    app.use('/api/*', requireAuth)
    app.get('/api/test', (c) => c.json({ ok: true }))

    const res = await app.request('/api/test')
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('not_authenticated')
  })

  it('returns 401 if token is invalid', async () => {
    const tokenService = mockTokenService()
    const requireAuth = createRequireAuth(tokenService)
    const app = new Hono()
    app.use('/api/*', requireAuth)
    app.get('/api/test', (c) => c.json({ ok: true }))

    const res = await app.request('/api/test', {
      headers: { Cookie: 'supaproxy_session=bad-token' },
    })
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('invalid_session')
  })

  it('sets user on context for valid token', async () => {
    const tokenService = mockTokenService()
    const requireAuth = createRequireAuth(tokenService)
    const app = new Hono<AuthEnv>()
    app.use('/api/*', requireAuth)
    app.get('/api/test', (c) => {
      const user = c.get('user')
      return c.json({ user })
    })

    const res = await app.request('/api/test', {
      headers: { Cookie: 'supaproxy_session=valid-token' },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.user.id).toBe('user-1')
    expect(body.user.email).toBe('test@example.com')
  })
})

describe('optionalAuth', () => {
  it('sets user to null if no cookie', async () => {
    const tokenService = mockTokenService()
    const optionalAuth = createOptionalAuth(tokenService)
    const app = new Hono<AuthEnv>()
    app.use('/api/*', optionalAuth)
    app.get('/api/test', (c) => c.json({ user: c.get('user') }))

    const res = await app.request('/api/test')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.user).toBeNull()
  })

  it('sets user to null if token is invalid', async () => {
    const tokenService = mockTokenService(false)
    const optionalAuth = createOptionalAuth(tokenService)
    const app = new Hono<AuthEnv>()
    app.use('/api/*', optionalAuth)
    app.get('/api/test', (c) => c.json({ user: c.get('user') }))

    const res = await app.request('/api/test', {
      headers: { Cookie: 'supaproxy_session=bad-token' },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.user).toBeNull()
  })

  it('sets user for valid token', async () => {
    const tokenService = mockTokenService()
    const optionalAuth = createOptionalAuth(tokenService)
    const app = new Hono<AuthEnv>()
    app.use('/api/*', optionalAuth)
    app.get('/api/test', (c) => c.json({ user: c.get('user') }))

    const res = await app.request('/api/test', {
      headers: { Cookie: 'supaproxy_session=valid-token' },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.user.id).toBe('user-1')
  })
})
