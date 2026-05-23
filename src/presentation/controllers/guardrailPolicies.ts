import type { ManagePoliciesUseCase } from '../../application/guardrail/ManagePoliciesUseCase.js'
import type { GetSecurityOverviewUseCase } from '../../application/guardrail/GetSecurityOverviewUseCase.js'
import type { CreatePolicyOverrideUseCase } from '../../application/guardrail/CreatePolicyOverrideUseCase.js'
import { parseBody } from '../middleware/validate.js'
import type { AuthUser, AuthEnv } from '../middleware/auth.js'
import { handleDomainError } from '../helpers/handleDomainError.js'
import { parsePagination } from '../helpers/parsePagination.js'
import { setEnforcementSchema, createOverrideSchema } from '../validators/guardrailPolicies.js'

export interface GuardrailPolicyRouteDeps {
  managePoliciesUseCase: ManagePoliciesUseCase
  getSecurityOverviewUseCase: GetSecurityOverviewUseCase
  createPolicyOverrideUseCase: CreatePolicyOverrideUseCase
  listAvailableGuardrails: (orgId: string) => Promise<Array<{ id: string; name: string; description: string; stage: string; source: 'core' | 'marketplace'; icon?: string; configSchema: { fields: Array<{ name: string; label: string; type: string; required?: boolean; placeholder?: string; helpText?: string; options?: Array<{ value: string; label: string }>; defaultValue?: string | boolean | number }> } }>>
  requireAuth: (c: import('hono').Context, next: import('hono').Next) => Promise<Response | void>
}

export function getSecurityOverview(deps: GuardrailPolicyRouteDeps) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const user = c.get('user') as AuthUser
    const days = parseInt(c.req.query('days') || '30', 10)
    const result = await deps.getSecurityOverviewUseCase.execute(user.org_id, days)
    return c.json(result)
  }
}

// TODO: Move data merging and filtering into a ListGuardrailPoliciesUseCase
// or expand ManagePoliciesUseCase.listPoliciesEnriched(orgId, filters).
export function listPolicies(deps: GuardrailPolicyRouteDeps) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const user = c.get('user') as AuthUser
    const { search } = parsePagination(c)
    const enforcementFilter = c.req.query('enforcement')
    const sourceFilter = c.req.query('source')
    const stageFilter = c.req.query('stage')

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
  }
}

export function getCompliance(deps: GuardrailPolicyRouteDeps) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const user = c.get('user') as AuthUser
    const pluginId = c.req.query('plugin')
    if (!pluginId) return c.json({ error: 'missing_plugin_param' }, 400)
    const search = c.req.query('search') || undefined
    const compliance = await deps.managePoliciesUseCase.getCompliance(user.org_id, pluginId, search)
    return c.json({ compliance })
  }
}

export function setEnforcement(deps: GuardrailPolicyRouteDeps) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const user = c.get('user') as AuthUser
    const pluginId = c.req.param('pluginId')!
    const body = await parseBody(c, setEnforcementSchema)
    if (!body.success) return body.response

    try {
      await deps.managePoliciesUseCase.setEnforcement(user.org_id, pluginId, body.data.enforcement)
      return c.json({ status: 'ok' })
    } catch (err) {
      return handleDomainError(c, err)
    }
  }
}

export function createOverride(deps: GuardrailPolicyRouteDeps) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const user = c.get('user') as AuthUser
    const pluginId = c.req.param('pluginId')!
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
      return handleDomainError(c, err)
    }
  }
}
