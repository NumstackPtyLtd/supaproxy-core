import { Hono } from 'hono'
import { z } from 'zod'
import type { InstallGuardrailUseCase } from '../../application/guardrail/InstallGuardrailUseCase.js'
import type { UninstallGuardrailUseCase } from '../../application/guardrail/UninstallGuardrailUseCase.js'
import type { InstalledGuardrailRepository } from '../../domain/guardrail/installedGuardrailRepository.js'
import { parseBody } from '../middleware/validate.js'
import type { AuthUser, AuthEnv } from '../middleware/auth.js'
import { NotFoundError, ConflictError, ValidationError } from '../../domain/shared/errors.js'

const installSchema = z.object({
  package_name: z.string().min(1).max(255),
})

interface InstalledGuardrailRouteDeps {
  installGuardrailUseCase: InstallGuardrailUseCase
  uninstallGuardrailUseCase: UninstallGuardrailUseCase
  installedGuardrailRepo: InstalledGuardrailRepository
  requireAuth: (c: import('hono').Context, next: import('hono').Next) => Promise<Response | void>
}

export function createInstalledGuardrailRoutes(deps: InstalledGuardrailRouteDeps) {
  const routes = new Hono<AuthEnv>()

  routes.use('/api/installed-guardrails/*', deps.requireAuth)
  routes.use('/api/installed-guardrails', deps.requireAuth)

  // List installed marketplace guardrails for the org
  routes.get('/api/installed-guardrails', async (c) => {
    const user = c.get('user') as AuthUser
    const installed = await deps.installedGuardrailRepo.findByOrg(user.org_id)
    return c.json({ installedGuardrails: installed })
  })

  // Install a marketplace guardrail
  routes.post('/api/installed-guardrails', async (c) => {
    const user = c.get('user') as AuthUser
    const body = await parseBody(c, installSchema)
    if (!body.success) return body.response

    try {
      const result = await deps.installGuardrailUseCase.execute(user.org_id, user.id, body.data.package_name)
      return c.json({ guardrail: result })
    } catch (err) {
      if (err instanceof ValidationError) return c.json({ error: err.message }, 400)
      if (err instanceof ConflictError) return c.json({ error: err.message }, 409)
      throw err
    }
  })

  // Uninstall a marketplace guardrail
  routes.delete('/api/installed-guardrails/:pluginId', async (c) => {
    const user = c.get('user') as AuthUser
    const pluginId = c.req.param('pluginId')

    try {
      await deps.uninstallGuardrailUseCase.execute(user.org_id, pluginId)
      return c.json({ status: 'ok' })
    } catch (err) {
      if (err instanceof ValidationError) return c.json({ error: err.message }, 400)
      if (err instanceof NotFoundError) return c.json({ error: 'not_found' }, 404)
      throw err
    }
  })

  return routes
}
