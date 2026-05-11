import { Hono } from 'hono'
import { setCookie, getCookie } from 'hono/cookie'
import { z } from 'zod'
import pino from 'pino'
import type { SignupUseCase } from '../../application/auth/SignupUseCase.js'
import type { LoginUseCase } from '../../application/auth/LoginUseCase.js'
import type { TokenService } from '../../application/ports/TokenService.js'
import { parseBody } from '../middleware/validate.js'
import { ConflictError, AuthenticationError } from '../../domain/shared/errors.js'

const log = pino({ name: 'routes/auth' })
const SESSION_MAX_AGE = 86400

const signupSchema = z.object({
  org_name: z.string().min(1, 'Organisation name is required').max(255),
  admin_name: z.string().min(1, 'Admin name is required').max(255),
  admin_email: z.string().email('A valid email is required').max(255),
  admin_password: z.string().min(8, 'Password must be at least 8 characters').max(255),
  workspace_name: z.string().max(255).optional(),
  team_name: z.string().max(255).optional(),
  system_prompt: z.string().max(10000).optional(),
})

const loginSchema = z.object({
  email: z.string().email('A valid email is required'),
  password: z.string().min(1, 'Password is required'),
})

interface AuthRouteDeps {
  signupUseCase: SignupUseCase
  loginUseCase: LoginUseCase
  tokenService: TokenService
  dashboardUrl: string
  isProduction: boolean
  cookieDomain: string | undefined
}

export function createAuthRoutes(deps: AuthRouteDeps) {
  const auth = new Hono()

  auth.post('/api/signup', async (c) => {
    const result = await parseBody(c, signupSchema)
    if (!result.success) return result.response

    try {
      const output = await deps.signupUseCase.execute({
        orgName: result.data.org_name,
        adminName: result.data.admin_name,
        adminEmail: result.data.admin_email,
        adminPassword: result.data.admin_password,
        workspaceName: result.data.workspace_name,
        teamName: result.data.team_name,
        systemPrompt: result.data.system_prompt,
      })

      setCookie(c, 'supaproxy_session', output.token, {
        httpOnly: true,
        secure: deps.isProduction,
        sameSite: 'Lax',
        path: '/',
        maxAge: SESSION_MAX_AGE,
        ...(deps.cookieDomain && { domain: deps.cookieDomain }),
      })

      log.info({ org: result.data.org_name, admin: result.data.admin_email, workspace: output.workspaceId }, 'Setup complete')
      return c.json({ status: 'ok', org_id: output.orgId, user_id: output.userId, workspace_id: output.workspaceId })
    } catch (err) {
      if (err instanceof ConflictError) return c.json({ error: err.message }, 400)
      throw err
    }
  })

  auth.post('/api/auth/login', async (c) => {
    const contentType = c.req.header('content-type') || ''
    const isFormSubmit = contentType.includes('form')

    let email: string
    let password: string

    if (isFormSubmit) {
      const body = await c.req.parseBody()
      email = body.email as string
      password = body.password as string
    } else {
      const result = await parseBody(c, loginSchema)
      if (!result.success) return result.response
      email = result.data.email
      password = result.data.password
    }

    if (!email || !password) {
      if (isFormSubmit) return c.redirect(`${deps.dashboardUrl}/login?error=missing_fields`)
      return c.json({ error: 'Email and password are required.' }, 400)
    }

    try {
      const output = await deps.loginUseCase.execute({ email, password })

      setCookie(c, 'supaproxy_session', output.token, {
        httpOnly: true,
        secure: deps.isProduction,
        sameSite: 'Lax',
        path: '/',
        maxAge: SESSION_MAX_AGE,
        ...(deps.cookieDomain && { domain: deps.cookieDomain }),
      })

      if (isFormSubmit) return c.redirect(`${deps.dashboardUrl}/workspaces`)
      return c.json({ status: 'ok', user: output.user })
    } catch (err) {
      if (err instanceof AuthenticationError) {
        if (isFormSubmit) return c.redirect(`${deps.dashboardUrl}/login?error=invalid_credentials`)
        return c.json({ error: err.message }, 401)
      }
      throw err
    }
  })

  auth.get('/api/auth/session', (c) => {
    const token = getCookie(c, 'supaproxy_session')
    if (!token) return c.json({ user: null })

    const payload = deps.tokenService.verify(token)
    if (!payload) return c.json({ user: null })

    return c.json({ user: { id: payload.id, email: payload.email, name: payload.name, role: payload.role } })
  })

  auth.get('/api/auth/logout', (c) => {
    setCookie(c, 'supaproxy_session', '', { path: '/', maxAge: 0, ...(deps.cookieDomain && { domain: deps.cookieDomain }) })
    return c.redirect(`${deps.dashboardUrl}/login`)
  })

  return auth
}
