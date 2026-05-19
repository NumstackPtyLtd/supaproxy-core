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
  listAvailableGuardrails: (orgId: string) => Promise<Array<{ id: string; name: string; description: string; stage: string; source: 'core' | 'marketplace'; icon?: string; configSchema: { fields: Array<{ name: string; label: string; type: string; required?: boolean; placeholder?: string; helpText?: string; options?: Array<{ value: string; label: string }>; defaultValue?: string | boolean | number }> } }>>
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

  // GET /api/guardrail-policies - list guardrails with enforcement, supports filtering
  policies.get('/api/guardrail-policies', async (c) => {
    const user = c.get('user') as AuthUser
    const search = c.req.query('search')?.toLowerCase()
    const enforcementFilter = c.req.query('enforcement') // mandatory | recommended | off
    const sourceFilter = c.req.query('source') // core | marketplace
    const stageFilter = c.req.query('stage') // pre-llm | post-llm | execution | retrieval

    const [allGuardrails, policyRows] = await Promise.all([
      deps.listAvailableGuardrails(user.org_id),
      deps.managePoliciesUseCase.listPolicies(user.org_id),
    ])

    const policyMap = new Map(policyRows.map(p => [p.plugin_id, p.enforcement]))

    let results = allGuardrails.map(g => ({
      ...g,
      enforcement: policyMap.get(g.id) || 'off',
    }))

    if (search) results = results.filter(g => g.name.toLowerCase().includes(search) || g.id.toLowerCase().includes(search) || g.description.toLowerCase().includes(search))
    if (enforcementFilter) results = results.filter(g => g.enforcement === enforcementFilter)
    if (sourceFilter) results = results.filter(g => g.source === sourceFilter)
    if (stageFilter) results = results.filter(g => g.stage === stageFilter)

    return c.json({ guardrails: results, total: results.length })
  })

  // GET /api/guardrail-policies/compliance?plugin=pattern - workspace compliance for a specific plugin
  policies.get('/api/guardrail-policies/compliance', async (c) => {
    const user = c.get('user') as AuthUser
    const pluginId = c.req.query('plugin')
    if (!pluginId) return c.json({ error: 'missing_plugin_param' }, 400)
    const search = c.req.query('search') || undefined
    const compliance = await deps.managePoliciesUseCase.getCompliance(user.org_id, pluginId, search)
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
      if (err instanceof ValidationError) return c.json({ error: 'validation_failed' }, 400)
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
      if (err instanceof ValidationError) return c.json({ error: 'validation_failed' }, 400)
      if (err instanceof NotFoundError) return c.json({ error: 'policy_not_found' }, 404)
      if (err instanceof ConflictError) return c.json({ error: 'conflict' }, 409)
      throw err
    }
  })

  return policies
}
