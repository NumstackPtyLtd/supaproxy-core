import { Hono } from 'hono'
import { z } from 'zod'
import type { GetOrgUseCase } from '../../application/organisation/GetOrgUseCase.js'
import type { UpdateOrgUseCase } from '../../application/organisation/UpdateOrgUseCase.js'
import type { GetOrgSettingsUseCase } from '../../application/organisation/GetOrgSettingsUseCase.js'
import type { UpdateOrgSettingUseCase } from '../../application/organisation/UpdateOrgSettingUseCase.js'
import type { TestIntegrationUseCase } from '../../application/organisation/TestIntegrationUseCase.js'
import type { registry as ProviderRegistryType } from '@supaproxy/providers'
import type { ListOrgUsersUseCase } from '../../application/organisation/ListOrgUsersUseCase.js'
import type { OrganisationRepository } from '../../domain/organisation/repository.js'
import { parseBody } from '../middleware/validate.js'
import type { AuthUser, AuthEnv } from '../middleware/auth.js'
import { NotFoundError, ValidationError } from '../../domain/shared/errors.js'

const updateOrgSchema = z.object({ name: z.string().min(1).max(255) })
const updateSettingSchema = z.object({ value: z.string().max(5000) })
const integrationTestSchema = z.object({ type: z.string().min(1), credentials: z.record(z.string().max(500)) })

interface OrgRouteDeps {
  getOrgUseCase: GetOrgUseCase
  updateOrgUseCase: UpdateOrgUseCase
  getOrgSettingsUseCase: GetOrgSettingsUseCase
  updateOrgSettingUseCase: UpdateOrgSettingUseCase
  testIntegrationUseCase: TestIntegrationUseCase
  listOrgUsersUseCase: ListOrgUsersUseCase
  orgRepo: OrganisationRepository
  providerRegistry?: typeof ProviderRegistryType
  requireAuth: (c: import('hono').Context, next: import('hono').Next) => Promise<Response | void>
}

export function createOrgRoutes(deps: OrgRouteDeps) {
  const org = new Hono<AuthEnv>()

  org.use('/api/org/*', deps.requireAuth)
  org.use('/api/org', deps.requireAuth)

  org.get('/api/org', async (c) => {
    const user = c.get('user') as AuthUser
    try {
      const orgData = await deps.getOrgUseCase.execute(user.org_id)
      return c.json({ org: orgData })
    } catch (err) {
      if (err instanceof NotFoundError) return c.json({ error: 'not_found' }, 404)
      throw err
    }
  })

  org.put('/api/org', async (c) => {
    const user = c.get('user') as AuthUser
    const result = await parseBody(c, updateOrgSchema)
    if (!result.success) return result.response
    await deps.updateOrgUseCase.execute(user.org_id, result.data.name)
    return c.json({ status: 'ok' })
  })

  org.get('/api/org/settings', async (c) => {
    const user = c.get('user') as AuthUser
    const settings = await deps.getOrgSettingsUseCase.execute(user.org_id)
    return c.json(settings)
  })

  org.put('/api/org/settings/:key', async (c) => {
    const user = c.get('user') as AuthUser
    const key = c.req.param('key')
    const result = await parseBody(c, updateSettingSchema)
    if (!result.success) return result.response
    await deps.updateOrgSettingUseCase.execute(user.org_id, key, result.data.value)
    return c.json({ status: 'ok' })
  })

  org.post('/api/org/integrations/test', async (c) => {
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
  })

  org.post('/api/org/providers/test', async (c) => {
    const parsed = await parseBody(c, z.object({
      type: z.string().min(1),
      apiKey: z.string().min(1),
    }))
    if (!parsed.success) return parsed.response

    const provider = deps.providerRegistry?.get(parsed.data.type)
    if (!provider) return c.json({ error: 'Unknown provider type' }, 400)
    if (!provider.testConnection) return c.json({ error: 'Provider does not support connection testing' }, 400)

    try {
      const result = await provider.testConnection(parsed.data.apiKey)
      return c.json(result)
    } catch (err) {
      return c.json({ ok: false, chat: false, embedding: false, error: (err as Error).message }, 400)
    }
  })

  org.post('/api/org/providers/models', async (c) => {
    const parsed = await parseBody(c, z.object({
      type: z.string().min(1),
      apiKey: z.string().min(1),
    }))
    if (!parsed.success) return parsed.response

    const provider = deps.providerRegistry?.get(parsed.data.type)
    if (!provider) return c.json({ error: 'Unknown provider type' }, 400)
    if (!provider.listModels) return c.json({ error: 'Provider does not support model listing' }, 400)

    try {
      const models = await provider.listModels(parsed.data.apiKey)
      return c.json({ models })
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400)
    }
  })

  org.get('/api/org/users', async (c) => {
    const user = c.get('user') as AuthUser
    const search = c.req.query('search') || undefined
    const limit = c.req.query('limit') ? Math.min(Math.max(parseInt(c.req.query('limit')!, 10) || 50, 1), 200) : 50
    const page = parseInt(c.req.query('page') || '0', 10)
    const result = await deps.listOrgUsersUseCase.execute(user.org_id, { search, limit, offset: page * limit })
    return c.json(result)
  })

  return org
}
