import { Hono } from 'hono'
import type { AuthEnv } from '../middleware/auth.js'
import {
  type GuardrailPolicyRouteDeps,
  getSecurityOverview, listPolicies, getCompliance, setEnforcement, createOverride,
} from '../controllers/guardrailPolicies.js'

export type { GuardrailPolicyRouteDeps }

export function createGuardrailPolicyRoutes(deps: GuardrailPolicyRouteDeps) {
  const policies = new Hono<AuthEnv>()

  policies.use('/api/guardrail-policies/*', deps.requireAuth)
  policies.use('/api/guardrail-policies', deps.requireAuth)
  policies.use('/api/security-overview', deps.requireAuth)

  policies.get('/api/security-overview', getSecurityOverview(deps))
  policies.get('/api/guardrail-policies', listPolicies(deps))
  policies.get('/api/guardrail-policies/compliance', getCompliance(deps))
  policies.put('/api/guardrail-policies/:pluginId', setEnforcement(deps))
  policies.post('/api/guardrail-policies/:pluginId/override', createOverride(deps))

  return policies
}
