import { Hono } from 'hono'
import type { GuardrailPolicyRepository } from '../../domain/guardrail/policyRepository.js'
import type { WorkspaceRepository } from '../../domain/workspace/repository.js'
import type { TenantService } from '../../application/ports/TenantService.js'
import { type AuthUser, type AuthEnv } from '../middleware/auth.js'

interface WorkspaceGuardrailRouteDeps {
  listAvailableGuardrails: (orgId: string) => Promise<Array<{ id: string; name: string; description: string; stage: string; source: 'core' | 'marketplace'; configSchema: { fields: Array<{ name: string; label: string; type: string; required?: boolean; placeholder?: string; helpText?: string; options?: Array<{ value: string; label: string }>; defaultValue?: string | boolean | number }> } }>>
  guardrailPolicyRepo: GuardrailPolicyRepository
  workspaceRepo: WorkspaceRepository
  tenantService: TenantService
  requireAuth: (c: import('hono').Context, next: import('hono').Next) => Promise<Response | void>
}

export function createWorkspaceGuardrailRoutes(deps: WorkspaceGuardrailRouteDeps, guardWorkspace: (workspaceId: string, userOrgId: string) => Promise<void>) {
  const app = new Hono<AuthEnv>()

  app.get('/api/workspaces/:id/guardrails', async (c) => {
    const user = c.get('user') as AuthUser
    const workspaceId = c.req.param('id')
    await guardWorkspace(workspaceId, user.org_id)

    const available = await deps.listAvailableGuardrails(user.org_id)
    const enabled = await deps.workspaceRepo.findEnabledGuardrailConfigs(workspaceId)
    const enabledIds = new Set(enabled.map(e => e.guardrail_id))

    // Fetch org-level policy enforcement for each guardrail
    const policies = await deps.guardrailPolicyRepo.listByOrg(user.org_id)
    const policyMap = new Map(policies.map(p => [p.plugin_id, p.enforcement]))

    const guardrails = available.map(g => ({
      ...g,
      enabled: enabledIds.has(g.id),
      workspaceConfig: enabled.find(e => e.guardrail_id === g.id)?.config || null,
      enforcement: policyMap.get(g.id) || null,
    }))

    return c.json({ guardrails })
  })

  app.post('/api/workspaces/:id/guardrails/:guardrailId/enable', async (c) => {
    const user = c.get('user') as AuthUser
    const workspaceId = c.req.param('id')
    const guardrailId = c.req.param('guardrailId')
    await guardWorkspace(workspaceId, user.org_id)

    const body = await c.req.json().catch(() => ({})) as { config?: string }
    const { generateId } = await import('../../domain/shared/EntityId.js')
    await deps.workspaceRepo.enableGuardrail(generateId(), workspaceId, guardrailId, body.config)

    return c.json({ ok: true })
  })

  app.post('/api/workspaces/:id/guardrails/:guardrailId/disable', async (c) => {
    const user = c.get('user') as AuthUser
    const workspaceId = c.req.param('id')
    const guardrailId = c.req.param('guardrailId')
    await guardWorkspace(workspaceId, user.org_id)

    await deps.workspaceRepo.disableGuardrail(workspaceId, guardrailId)

    return c.json({ ok: true })
  })

  return app
}
