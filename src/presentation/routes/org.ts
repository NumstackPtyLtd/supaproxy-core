import { Hono } from 'hono'
import { z } from 'zod'
import type { GetOrgUseCase } from '../../application/organisation/GetOrgUseCase.js'
import type { UpdateOrgUseCase } from '../../application/organisation/UpdateOrgUseCase.js'
import type { GetOrgSettingsUseCase } from '../../application/organisation/GetOrgSettingsUseCase.js'
import type { UpdateOrgSettingUseCase } from '../../application/organisation/UpdateOrgSettingUseCase.js'
import type { TestIntegrationUseCase } from '../../application/organisation/TestIntegrationUseCase.js'
import type { registry as ProviderRegistryType } from '@supaproxy/providers'
import type { ListOrgUsersUseCase } from '../../application/organisation/ListOrgUsersUseCase.js'
import type { ListOrgConnectionsUseCase } from '../../application/workspace/ListOrgConnectionsUseCase.js'
import type { GetConnectionToolsUseCase } from '../../application/workspace/GetConnectionToolsUseCase.js'
import type { ReconnectConnectionUseCase } from '../../application/connector/ReconnectConnectionUseCase.js'
import type { DeleteConnectionUseCase } from '../../application/workspace/DeleteConnectionUseCase.js'
import type { OrganisationRepository } from '../../domain/organisation/repository.js'
import { parseBody } from '../middleware/validate.js'
import type { AuthUser, AuthEnv } from '../middleware/auth.js'
import { NotFoundError, ValidationError } from '../../domain/shared/errors.js'
import { DEFAULT_PAGINATION_LIMIT, MAX_PAGINATION_LIMIT } from '../../defaults.js'
import pino from 'pino'

const log = pino({ name: 'routes/org' })

const updateOrgSchema = z.object({ name: z.string().min(1).max(255) })
const updateSettingSchema = z.object({ value: z.string().max(5000) })
const integrationTestSchema = z.object({ type: z.string().min(1), credentials: z.record(z.string().max(500)) })
const providerTestSchema = z.object({ type: z.string().min(1), api_key: z.string().min(1) })

interface OrgRouteDeps {
  getOrgUseCase: GetOrgUseCase
  updateOrgUseCase: UpdateOrgUseCase
  getOrgSettingsUseCase: GetOrgSettingsUseCase
  updateOrgSettingUseCase: UpdateOrgSettingUseCase
  testIntegrationUseCase: TestIntegrationUseCase
  listOrgUsersUseCase: ListOrgUsersUseCase
  listOrgConnectionsUseCase: ListOrgConnectionsUseCase
  getConnectionToolsUseCase: GetConnectionToolsUseCase
  reconnectConnectionUseCase: ReconnectConnectionUseCase
  deleteConnectionUseCase: DeleteConnectionUseCase
  orgRepo: OrganisationRepository
  providerRegistry?: typeof ProviderRegistryType
  requireAuth: (c: import('hono').Context, next: import('hono').Next) => Promise<Response | void>
}

function parsePagination(c: import('hono').Context) {
  const limit = c.req.query('limit') ? Math.min(Math.max(parseInt(c.req.query('limit')!, 10) || DEFAULT_PAGINATION_LIMIT, 1), MAX_PAGINATION_LIMIT) : DEFAULT_PAGINATION_LIMIT
  const page = parseInt(c.req.query('page') || '0', 10)
  const search = c.req.query('search') || undefined
  return { search, limit, page, offset: page * limit }
}

function getOrg(deps: OrgRouteDeps) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const user = c.get('user') as AuthUser
    try {
      const orgData = await deps.getOrgUseCase.execute(user.org_id)
      return c.json({ org: orgData })
    } catch (err) {
      if (err instanceof NotFoundError) return c.json({ error: 'not_found' }, 404)
      throw err
    }
  }
}

function updateOrg(deps: OrgRouteDeps) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const user = c.get('user') as AuthUser
    const result = await parseBody(c, updateOrgSchema)
    if (!result.success) return result.response
    await deps.updateOrgUseCase.execute(user.org_id, result.data.name)
    return c.json({ status: 'ok' })
  }
}

function getOrgSettings(deps: OrgRouteDeps) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const user = c.get('user') as AuthUser
    const settings = await deps.getOrgSettingsUseCase.execute(user.org_id)
    return c.json(settings)
  }
}

function updateOrgSetting(deps: OrgRouteDeps) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const user = c.get('user') as AuthUser
    const key = c.req.param('key')!
    const result = await parseBody(c, updateSettingSchema)
    if (!result.success) return result.response
    await deps.updateOrgSettingUseCase.execute(user.org_id, key, result.data.value)
    return c.json({ status: 'ok' })
  }
}

function testIntegration(deps: OrgRouteDeps) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const result = await parseBody(c, integrationTestSchema)
    if (!result.success) return result.response

    try {
      const testResult = await deps.testIntegrationUseCase.execute(result.data.type, result.data.credentials)
      if (!testResult.ok) return c.json({ error: testResult.error }, 400)
      return c.json(testResult.detail || { status: 'ok' })
    } catch (err) {
      if (err instanceof ValidationError) return c.json({ error: 'validation_failed' }, 400)
      return c.json({ error: 'integration_test_failed' }, 400)
    }
  }
}

function testProvider(deps: OrgRouteDeps) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const parsed = await parseBody(c, providerTestSchema)
    if (!parsed.success) return parsed.response

    const provider = deps.providerRegistry?.get(parsed.data.type)
    if (!provider) return c.json({ error: 'unknown_provider_type' }, 400)
    if (!provider.testConnection) return c.json({ error: 'provider_no_connection_test' }, 400)

    try {
      const result = await provider.testConnection(parsed.data.api_key)
      return c.json(result)
    } catch (err) {
      log.error({ err, type: parsed.data.type }, 'Provider connection test failed')
      return c.json({ ok: false, chat: false, embedding: false, error: 'provider_test_failed' }, 400)
    }
  }
}

function listProviderModels(deps: OrgRouteDeps) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const parsed = await parseBody(c, providerTestSchema)
    if (!parsed.success) return parsed.response

    const provider = deps.providerRegistry?.get(parsed.data.type)
    if (!provider) return c.json({ error: 'unknown_provider_type' }, 400)
    if (!provider.listModels) return c.json({ error: 'provider_no_model_list' }, 400)

    try {
      const models = await provider.listModels(parsed.data.api_key)
      return c.json({ models })
    } catch (err) {
      log.error({ err, type: parsed.data.type }, 'Provider model list failed')
      return c.json({ error: 'provider_model_list_failed' }, 400)
    }
  }
}

function listOrgConnections(deps: OrgRouteDeps) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const user = c.get('user') as AuthUser
    const { search, limit, page, offset } = parsePagination(c)
    const result = await deps.listOrgConnectionsUseCase.execute(user.org_id, { search, limit, offset })
    return c.json({ ...result, page, limit })
  }
}

function getConnectionTools(deps: OrgRouteDeps) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const result = await deps.getConnectionToolsUseCase.execute(c.req.param('id')!)
    return c.json(result)
  }
}

function reconnectConnection(deps: OrgRouteDeps) {
  return async (c: import('hono').Context<AuthEnv>) => {
    try {
      const result = await deps.reconnectConnectionUseCase.execute(c.req.param('id')!)
      return c.json(result)
    } catch (err) {
      if (err instanceof NotFoundError) return c.json({ error: 'not_found' }, 404)
      throw err
    }
  }
}

function deleteOrgConnection(deps: OrgRouteDeps) {
  return async (c: import('hono').Context<AuthEnv>) => {
    await deps.deleteConnectionUseCase.execute(c.req.param('id')!)
    return c.json({ status: 'ok' })
  }
}

function listOrgUsers(deps: OrgRouteDeps) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const user = c.get('user') as AuthUser
    const { search, limit, offset } = parsePagination(c)
    const result = await deps.listOrgUsersUseCase.execute(user.org_id, { search, limit, offset })
    return c.json(result)
  }
}

export function createOrgRoutes(deps: OrgRouteDeps) {
  const org = new Hono<AuthEnv>()

  org.use('/api/org/*', deps.requireAuth)
  org.use('/api/org', deps.requireAuth)

  org.get('/api/org', getOrg(deps))
  org.put('/api/org', updateOrg(deps))
  org.get('/api/org/settings', getOrgSettings(deps))
  org.put('/api/org/settings/:key', updateOrgSetting(deps))
  org.post('/api/org/integrations/test', testIntegration(deps))
  org.post('/api/org/providers/test', testProvider(deps))
  org.post('/api/org/providers/models', listProviderModels(deps))
  org.get('/api/org/connections', listOrgConnections(deps))
  org.get('/api/org/connections/:id/tools', getConnectionTools(deps))
  org.post('/api/org/connections/:id/reconnect', reconnectConnection(deps))
  org.delete('/api/org/connections/:id', deleteOrgConnection(deps))
  org.get('/api/org/users', listOrgUsers(deps))

  return org
}
