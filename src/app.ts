/**
 * App factory: creates the Hono app with all routes mounted.
 *
 * This is the composable entry point that both the open-source
 * server and the cloud overlay use. The cloud overlay can mount
 * additional routes after calling this.
 */
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getCookie } from 'hono/cookie'
import pino from 'pino'
import type { Container } from './container.js'
import { CORS_ORIGINS } from './config.js'
import { handleWebhook, verifyWebhook } from '@supaproxy/consumers'
import docs from './openapi.js'

const log = pino({ name: 'supaproxy' })

export function createApp(container: Container, corsOrigins?: string[]): Hono {
  const app = new Hono()

  app.use('*', cors({
    origin: (origin) => {
      const origins = corsOrigins ?? CORS_ORIGINS
      return origins.includes(origin) ? origin : origins[0]
    },
    credentials: true,
  }))

  app.onError((err, c) => {
    log.error({ error: err.message, stack: err.stack }, 'Unhandled error')
    return c.json({ error: 'internal_error' }, 500)
  })

  // Health check
  app.get('/health', async (c) => {
    try {
      const token = getCookie(c, 'supaproxy_session')
      const payload = token ? container.tokenService.verify(token) : null
      if (!payload) return c.json({ status: 'ok' })
      const result = await container.getHealthUseCase.executeAuthenticated()
      return c.json(result)
    } catch (err) {
      log.error({ error: (err as Error).message }, 'Health check failed')
      return c.json({ status: 'error' }, 500)
    }
  })

  // Models
  app.get('/api/models', async (c) => {
    const models = await container.getModelsUseCase.execute()
    return c.json({ models })
  })

  // Consumer types
  app.get('/api/consumers/types', (c) => {
    return c.json({ consumers: container.consumerRegistry.schemas() })
  })

  // Provider types
  app.get('/api/providers/types', (c) => {
    return c.json({ providers: container.providerRegistry.schemas() })
  })

  // Route modules
  app.route('/', container.authRoutes)
  app.route('/', container.orgRoutes)
  app.route('/', container.queueRoutes)
  app.route('/', container.workspaceRoutes)
  app.route('/', container.conversationRoutes)
  app.route('/', container.connectorRoutes)
  app.route('/', container.queryRoutes)
  app.route('/', container.routeRoutes)
  app.route('/', container.promptRoutes)
  app.route('/', container.guardrailPolicyRoutes)
  app.route('/', container.installedGuardrailRoutes)
  app.route('/', container.integrationRoutes)

  // WhatsApp webhook (no auth; Meta needs direct access)
  app.get('/api/webhooks/whatsapp', async (c) => {
    const mode = c.req.query('hub.mode') || ''
    const token = c.req.query('hub.verify_token') || ''
    const challenge = c.req.query('hub.challenge') || ''

    const settings = await container.orgRepo.getSettingValues(['whatsapp_verify_token'])
    const verifyToken = settings['whatsapp_verify_token'] || ''

    const result = verifyWebhook(mode, token, challenge, verifyToken)
    if (result) return c.text(result)
    return c.json({ error: 'forbidden' }, 403)
  })

  app.post('/api/webhooks/whatsapp', async (c) => {
    const body = await c.req.json()
    handleWebhook(body)
    return c.json({ status: 'ok' })
  })

  // API docs
  app.route('/', docs)

  return app
}
