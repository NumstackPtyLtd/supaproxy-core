/**
 * Open-source server entry point.
 *
 * Uses the composable pieces directly. No cloud overlay.
 * Single-tenant mode (NoOpTenantService is the default).
 *
 * Cloud overlays import from ./server.ts and inject their own
 * TenantService + additional routes.
 */
import 'dotenv/config'
import { serve } from '@hono/node-server'
import pino from 'pino'
import { createContainer } from './container.js'
import { createApp } from './app.js'
import { startConsumers, startWorkers } from './startup.js'
import { PORT, DASHBOARD_URL, JWT_SECRET, IS_PRODUCTION, COOKIE_DOMAIN, QUEUE_HOST, QUEUE_PORT, SESSION_HOST, SESSION_PORT, DATABASE_HOST, DATABASE_PORT, DATABASE_USER, DATABASE_PASSWORD, DATABASE_NAME, VECTOR_STORE_PATH } from './config.js'
import { createAuthRoutes } from '@supaproxy/auth'
import { registry as guardrailRegistry, executionCatalogue, retrievalCatalogue } from '@supaproxy/guardrails'
import { generateId, generateWorkspaceId } from './domain/shared/EntityId.js'
import { DEFAULT_SYSTEM_PROMPT } from './defaults.js'
import { createMysqlInfra, runMigrations, createPool } from '@supaproxy/mysql'
import { createBullMqQueue } from '@supaproxy/bullmq'
import { createLanceDBVectors } from '@supaproxy/lancedb'
import { createRedisSession } from '@supaproxy/redis'

const log = pino({ name: 'supaproxy' })

// Prevent unhandled rejections from crashing the process (e.g. consumer SDK async errors)
process.on('unhandledRejection', (reason) => {
  log.error({ error: reason instanceof Error ? reason.message : String(reason) }, 'Unhandled rejection (server continues)')
})

// --- Init ---
const pool = createPool({ host: DATABASE_HOST, port: DATABASE_PORT, user: DATABASE_USER, password: DATABASE_PASSWORD, database: DATABASE_NAME })
await runMigrations(pool)

// --- Database adapter (default: @supaproxy/mysql) ---
const infra = createMysqlInfra(pool)

// --- Queue adapter (default: @supaproxy/bullmq) ---
const queueService = createBullMqQueue(QUEUE_HOST, QUEUE_PORT)

// --- Vector store adapter (default: @supaproxy/lancedb) ---
const vectorStore = createLanceDBVectors(VECTOR_STORE_PATH)

// --- Session store adapter (default: @supaproxy/redis) ---
const sessionStore = createRedisSession(SESSION_HOST, SESSION_PORT)

// --- Auth (default: @supaproxy/auth with JWT + bcrypt) ---
const { routes: authRoutes, requireAuth } = createAuthRoutes({
  repo: {
    findUserByEmail: (email) => infra.orgRepo.findUserByEmail(email),
    createOrg: (id, name, slug) => infra.orgRepo.create(id, name, slug),
    createUser: (id, orgId, email, name, hash, role) => infra.orgRepo.createUser(id, orgId, email, name, hash, role),
    createTeam: (id, orgId, name) => infra.orgRepo.createTeam(id, orgId, name),
    createWorkspace: (id, orgId, teamId, name, model, systemPrompt) =>
      infra.workspaceRepo.create({ id, orgId, teamId, name, model, systemPrompt }),
  },
  options: {
    jwtSecret: JWT_SECRET,
    isProduction: IS_PRODUCTION,
    cookieDomain: COOKIE_DOMAIN,
    dashboardUrl: DASHBOARD_URL,
  },
  generateId,
  generateWorkspaceId: () => generateWorkspaceId(),
  defaultSystemPrompt: DEFAULT_SYSTEM_PROMPT,
})

// --- Composition root ---
const container = createContainer(infra, { queueService, vectorStore, sessionStore, authRoutes, requireAuth, guardrailRegistry, executionCatalogue, retrievalCatalogue })

// --- App ---
const app = createApp(container)

// --- Start ---
const workspaceCount = await container.workspaceRepo.getActiveWorkspaceCount()
log.info({ port: PORT, workspaces: workspaceCount }, 'SupaProxy server starting')

serve({ fetch: app.fetch, port: PORT }, async () => {
  log.info({ port: PORT }, 'SupaProxy API listening')
  log.info({ dashboard: DASHBOARD_URL }, 'Dashboard URL')

  await startConsumers(container)
  await startWorkers(container)
})
