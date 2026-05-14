import { Hono } from 'hono'
import { z } from 'zod'
import type { ManagePoliciesUseCase } from '../../application/guardrail/ManagePoliciesUseCase.js'
import type { GetSecurityOverviewUseCase } from '../../application/guardrail/GetSecurityOverviewUseCase.js'
import type { CreatePolicyOverrideUseCase } from '../../application/guardrail/CreatePolicyOverrideUseCase.js'
import { parseBody } from '../middleware/validate.js'
import type { AuthUser, AuthEnv } from '../middleware/auth.js'
import { NotFoundError, ConflictError, ValidationError } from '../../domain/shared/errors.js'

const setEnforcementSchema = z.object({
  enforcement: z.enum(['mandatory', 'recommended', 'off']),
})

const createOverrideSchema = z.object({
  workspace_id: z.string().min(1).max(64),
  justification: z.string().min(1).max(2000),
})

interface GuardrailPolicyRouteDeps {
  managePoliciesUseCase: ManagePoliciesUseCase
  getSecurityOverviewUseCase: GetSecurityOverviewUseCase
  createPolicyOverrideUseCase: CreatePolicyOverrideUseCase
  requireAuth: (c: import('hono').Context, next: import('hono').Next) => Promise<Response | void>
}

export function createGuardrailPolicyRoutes(deps: GuardrailPolicyRouteDeps) {
  const policies = new Hono<AuthEnv>()

  policies.use('/api/guardrail-policies/*', deps.requireAuth)
  policies.use('/api/guardrail-policies', deps.requireAuth)
  policies.use('/api/security-overview', deps.requireAuth)

  // GET /api/security-overview - org-wide security pulse
  policies.get('/api/security-overview', async (c) => {
    const user = c.get('user') as AuthUser
    const days = parseInt(c.req.query('days') || '30', 10)
    const result = await deps.getSecurityOverviewUseCase.execute(user.org_id, days)
    return c.json(result)
  })

  // GET /api/guardrail-policies - list all policies for the org
  policies.get('/api/guardrail-policies', async (c) => {
    const user = c.get('user') as AuthUser
    const result = await deps.managePoliciesUseCase.listPolicies(user.org_id)
    return c.json({ policies: result })
  })

  // GET /api/guardrail-policies/compliance?plugin=pattern - workspace compliance for a specific plugin
  policies.get('/api/guardrail-policies/compliance', async (c) => {
    const user = c.get('user') as AuthUser
    const pluginId = c.req.query('plugin')
    if (!pluginId) return c.json({ error: 'plugin query param required' }, 400)
    const compliance = await deps.managePoliciesUseCase.getCompliance(user.org_id, pluginId)
    return c.json({ compliance })
  })

  // PUT /api/guardrail-policies/:pluginId - set enforcement level
  policies.put('/api/guardrail-policies/:pluginId', async (c) => {
    const user = c.get('user') as AuthUser
    const pluginId = c.req.param('pluginId')
    const body = await parseBody(c, setEnforcementSchema)
    if (!body.success) return body.response

    try {
      await deps.managePoliciesUseCase.setEnforcement(user.org_id, pluginId, body.data.enforcement)
      return c.json({ status: 'ok' })
    } catch (err) {
      if (err instanceof ValidationError) return c.json({ error: err.message }, 400)
      throw err
    }
  })

  // POST /api/guardrail-policies/:pluginId/override - workspace admin justifies disabling a recommended policy
  policies.post('/api/guardrail-policies/:pluginId/override', async (c) => {
    const user = c.get('user') as AuthUser
    const pluginId = c.req.param('pluginId')
    const body = await parseBody(c, createOverrideSchema)
    if (!body.success) return body.response

    try {
      await deps.createPolicyOverrideUseCase.execute({
        orgId: user.org_id,
        pluginId,
        workspaceId: body.data.workspace_id,
        justification: body.data.justification,
        userId: user.id,
      })
      return c.json({ status: 'ok' })
    } catch (err) {
      if (err instanceof ValidationError) return c.json({ error: err.message }, 400)
      if (err instanceof NotFoundError) return c.json({ error: 'policy_not_found' }, 404)
      if (err instanceof ConflictError) return c.json({ error: err.message }, 409)
      throw err
    }
  })

  return policies
}
