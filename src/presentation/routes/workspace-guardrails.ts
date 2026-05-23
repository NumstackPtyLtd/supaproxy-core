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

type GuardFn = (workspaceId: string, userOrgId: string) => Promise<void>

function listGuardrails(deps: WorkspaceGuardrailRouteDeps, guard: GuardFn) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const user = c.get('user') as AuthUser
    const workspaceId = c.req.param('id')!
    await guard(workspaceId, user.org_id)

    const available = await deps.listAvailableGuardrails(user.org_id)
    const enabled = await deps.workspaceRepo.findEnabledGuardrailConfigs(workspaceId)
    const enabledIds = new Set(enabled.map(e => e.guardrail_id))

    const policies = await deps.guardrailPolicyRepo.listByOrg(user.org_id)
    const policyMap = new Map(policies.map(p => [p.plugin_id, p.enforcement]))

    const guardrails = available.map(g => ({
      ...g,
      enabled: enabledIds.has(g.id),
      workspaceConfig: enabled.find(e => e.guardrail_id === g.id)?.config || null,
      enforcement: policyMap.get(g.id) || null,
    }))

    return c.json({ guardrails })
  }
}

function enableGuardrail(deps: WorkspaceGuardrailRouteDeps, guard: GuardFn) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const user = c.get('user') as AuthUser
    const workspaceId = c.req.param('id')!
    const guardrailId = c.req.param('guardrailId')!
    await guard(workspaceId, user.org_id)

    const body = await c.req.json().catch(() => ({})) as { config?: string }
    const { generateId } = await import('../../domain/shared/EntityId.js')
    await deps.workspaceRepo.enableGuardrail(generateId(), workspaceId, guardrailId, body.config)

    return c.json({ ok: true })
  }
}

function disableGuardrail(deps: WorkspaceGuardrailRouteDeps, guard: GuardFn) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const user = c.get('user') as AuthUser
    const workspaceId = c.req.param('id')!
    const guardrailId = c.req.param('guardrailId')!
    await guard(workspaceId, user.org_id)

    await deps.workspaceRepo.disableGuardrail(workspaceId, guardrailId)

    return c.json({ ok: true })
  }
}

export function createWorkspaceGuardrailRoutes(deps: WorkspaceGuardrailRouteDeps, guardWorkspace: GuardFn) {
  const app = new Hono<AuthEnv>()

  app.get('/api/workspaces/:id/guardrails', listGuardrails(deps, guardWorkspace))
  app.post('/api/workspaces/:id/guardrails/:guardrailId/enable', enableGuardrail(deps, guardWorkspace))
  app.post('/api/workspaces/:id/guardrails/:guardrailId/disable', disableGuardrail(deps, guardWorkspace))

  return app
}
