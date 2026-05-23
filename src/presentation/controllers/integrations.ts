import type { ManageIntegrationUseCase } from '../../application/integration/ManageIntegrationUseCase.js'
import type { ManageEntryPointUseCase } from '../../application/integration/ManageEntryPointUseCase.js'
import type { IntegrationRepository } from '../../domain/integration/repository.js'
import type { EntryPointRepository } from '../../domain/integration/repository.js'
import { parseBody } from '../middleware/validate.js'
import type { AuthUser, AuthEnv } from '../middleware/auth.js'
import { NotFoundError } from '../../domain/shared/errors.js'
import { createEntryPointSchema, updateEntryPointSchema } from '../validators/integrations.js'

export interface IntegrationRouteDeps {
  manageIntegrationUseCase: ManageIntegrationUseCase
  manageEntryPointUseCase: ManageEntryPointUseCase
  integrationRepo: IntegrationRepository
  entryPointRepo: EntryPointRepository
  requireAuth: (c: import('hono').Context, next: import('hono').Next) => Promise<Response | void>
}

export function listIntegrations(deps: IntegrationRouteDeps) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const user = c.get('user') as AuthUser
    const integrations = await deps.manageIntegrationUseCase.listIntegrations(user.org_id)
    return c.json({ integrations })
  }
}

export function activateIntegration(deps: IntegrationRouteDeps) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const user = c.get('user') as AuthUser
    await deps.manageIntegrationUseCase.activate(user.org_id, c.req.param('type')!)
    return c.json({ status: 'ok' })
  }
}

export function deactivateIntegration(deps: IntegrationRouteDeps) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const user = c.get('user') as AuthUser
    await deps.manageIntegrationUseCase.deactivate(user.org_id, c.req.param('type')!)
    return c.json({ status: 'ok' })
  }
}

export function listEntryPoints(deps: IntegrationRouteDeps) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const user = c.get('user') as AuthUser
    const entryPoints = await deps.entryPointRepo.findByOrg(user.org_id)
    return c.json({ entryPoints })
  }
}

export function createEntryPoint(deps: IntegrationRouteDeps) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const user = c.get('user') as AuthUser
    const body = await parseBody(c, createEntryPointSchema)
    if (!body.success) return body.response

    try {
      await deps.manageEntryPointUseCase.createEntryPoint(user.org_id, body.data.type, {
        channel_id: body.data.channel_id,
        channel_name: body.data.channel_name,
        direct: body.data.direct,
        direct_workspace_id: body.data.direct_workspace_id,
      })
      return c.json({ status: 'ok' })
    } catch (err) {
      if (err instanceof NotFoundError) return c.json({ error: 'integration_not_found' }, 404)
      throw err
    }
  }
}

export function updateEntryPoint(deps: IntegrationRouteDeps) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const body = await parseBody(c, updateEntryPointSchema)
    if (!body.success) return body.response

    try {
      await deps.manageEntryPointUseCase.updateEntryPoint(c.req.param('id')!, body.data)
      return c.json({ status: 'ok' })
    } catch (err) {
      if (err instanceof NotFoundError) return c.json({ error: 'not_found' }, 404)
      throw err
    }
  }
}

export function deleteEntryPoint(deps: IntegrationRouteDeps) {
  return async (c: import('hono').Context<AuthEnv>) => {
    try {
      await deps.manageEntryPointUseCase.deleteEntryPoint(c.req.param('id')!)
      return c.json({ status: 'ok' })
    } catch (err) {
      if (err instanceof NotFoundError) return c.json({ error: 'not_found' }, 404)
      throw err
    }
  }
}
