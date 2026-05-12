import { getCookie } from 'hono/cookie'
import type { Context, Next } from 'hono'
import type { TokenService } from '../../application/ports/TokenService.js'

export interface AuthUser {
  id: string
  email: string
  name: string
  role: string
  org_id: string
}

export type AuthEnv = {
  Variables: {
    user: AuthUser | null
  }
}

export function createRequireAuth(tokenService: TokenService) {
  return async function requireAuth(c: Context, next: Next) {
    const token = getCookie(c, 'supaproxy_session')
    if (!token) return c.json({ error: 'not_authenticated' }, 401)

    const payload = tokenService.verify(token)
    if (!payload) return c.json({ error: 'invalid_session' }, 401)

    c.set('user', payload as AuthUser)
    await next()
  }
}

export function createOptionalAuth(tokenService: TokenService) {
  return async function optionalAuth(c: Context, next: Next) {
    const token = getCookie(c, 'supaproxy_session')
    if (token) {
      const payload = tokenService.verify(token)
      c.set('user', payload as AuthUser | null)
    } else {
      c.set('user', null)
    }
    await next()
  }
}
