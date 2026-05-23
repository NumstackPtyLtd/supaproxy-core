import { Hono } from 'hono'
import { z } from 'zod'
import type { GetOrgUseCase } from '../../application/organisation/GetOrgUseCase.js'
import type { UpdateOrgUseCase } from '../../application/organisation/UpdateOrgUseCase.js'
import type { GetOrgSettingsUseCase } from '../../application/organisation/GetOrgSettingsUseCase.js'
import type { UpdateOrgSettingUseCase } from '../../application/organisation/UpdateOrgSettingUseCase.js'
import type { TestIntegrationUseCase } from '../../application/organisation/TestIntegrationUseCase.js'
import type { TestProviderUseCase } from '../../application/organisation/TestProviderUseCase.js'
import type { ListProviderModelsUseCase } from '../../application/organisation/ListProviderModelsUseCase.js'
import type { ListOrgUsersUseCase } from '../../application/organisation/ListOrgUsersUseCase.js'
import type { ListOrgConnectionsUseCase } from '../../application/workspace/ListOrgConnectionsUseCase.js'
import type { GetConnectionToolsUseCase } from '../../application/workspace/GetConnectionToolsUseCase.js'
import type { ReconnectConnectionUseCase } from '../../application/connector/ReconnectConnectionUseCase.js'
import type { DeleteConnectionUseCase } from '../../application/workspace/DeleteConnectionUseCase.js'
import { parseBody } from '../middleware/validate.js'
import type { AuthUser, AuthEnv } from '../middleware/auth.js'
import { handleDomainError } from '../helpers/handleDomainError.js'
import { parsePagination } from '../helpers/parsePagination.js'

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
  testProviderUseCase: TestProviderUseCase
  listProviderModelsUseCase: ListProviderModelsUseCase
  listOrgUsersUseCase: ListOrgUsersUseCase
  listOrgConnectionsUseCase: ListOrgConnectionsUseCase
  getConnectionToolsUseCase: GetConnectionToolsUseCase
  reconnectConnectionUseCase: ReconnectConnectionUseCase
  deleteConnectionUseCase: DeleteConnectionUseCase
  requireAuth: (c: import('hono').Context, next: import('hono').Next) => Promise<Response | void>
}

function getOrg(deps: OrgRouteDeps) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const user = c.get('user') as AuthUser
    try {
      const orgData = await deps.getOrgUseCase.execute(user.org_id)
      return c.json({ org: orgData })
    } catch (err) {
      return handleDomainError(c, err)
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
      return handleDomainError(c, err)
    }
  }
}

function testProvider(deps: OrgRouteDeps) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const parsed = await parseBody(c, providerTestSchema)
    if (!parsed.success) return parsed.response

    try {
      const result = await deps.testProviderUseCase.execute(parsed.data.type, parsed.data.api_key)
      return c.json(result)
    } catch (err) {
      return handleDomainError(c, err)
    }
  }
}

function listProviderModels(deps: OrgRouteDeps) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const parsed = await parseBody(c, providerTestSchema)
    if (!parsed.success) return parsed.response

    try {
      const models = await deps.listProviderModelsUseCase.execute(parsed.data.type, parsed.data.api_key)
      return c.json({ models })
    } catch (err) {
      return handleDomainError(c, err)
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
      return handleDomainError(c, err)
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
