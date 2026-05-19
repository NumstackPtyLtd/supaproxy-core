/**
 * Open-source server entry point.
 *
 * Uses the composable pieces directly. No cloud overlay.
 * Single-tenant mode (NoOpTenantService is the default).
 *
 * The cloud overlay (supaproxy-cloud) imports from ./server.ts
 * and injects CloudTenantService + additional routes.
 */
import 'dotenv/config'
import { serve } from '@hono/node-server'
import pino from 'pino'
import { getPool } from './db/pool.js'
import { runMigrations } from './db/migrations.js'
import { createContainer } from './container.js'
import { createApp } from './app.js'
import { startConsumers, startWorkers } from './startup.js'
import { PORT, DASHBOARD_URL, JWT_SECRET, IS_PRODUCTION, COOKIE_DOMAIN } from './config.js'
import { createAuthRoutes } from '@supaproxy/auth'
import { registry as guardrailRegistry, executionCatalogue, retrievalCatalogue } from '@supaproxy/guardrails'
import { generateId, generateWorkspaceId } from './domain/shared/EntityId.js'
import { DEFAULT_SYSTEM_PROMPT } from './defaults.js'
import { MysqlOrganisationRepository } from './infrastructure/persistence/mysql/MysqlOrganisationRepository.js'
import { MysqlWorkspaceRepository } from './infrastructure/persistence/mysql/MysqlWorkspaceRepository.js'

const log = pino({ name: 'supaproxy' })

// Prevent unhandled rejections from crashing the process (e.g. consumer SDK async errors)
process.on('unhandledRejection', (reason) => {
  log.error({ error: reason instanceof Error ? reason.message : String(reason) }, 'Unhandled rejection (server continues)')
})

// --- Init ---
const pool = getPool()
await runMigrations(pool)

// --- Auth (default: @supaproxy/auth with JWT + bcrypt) ---
const orgRepo = new MysqlOrganisationRepository(pool)
const wsRepo = new MysqlWorkspaceRepository(pool)

const { routes: authRoutes, requireAuth } = createAuthRoutes({
  repo: {
    findUserByEmail: (email) => orgRepo.findUserByEmail(email),
    createOrg: (id, name, slug) => orgRepo.create(id, name, slug),
    createUser: (id, orgId, email, name, hash, role) => orgRepo.createUser(id, orgId, email, name, hash, role),
    createTeam: (id, orgId, name) => orgRepo.createTeam(id, orgId, name),
    createWorkspace: (id, orgId, teamId, name, model, systemPrompt) =>
      wsRepo.create({ id, orgId, teamId, name, model, systemPrompt }),
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
const container = createContainer(pool, { authRoutes: authRoutes as any, requireAuth, guardrailRegistry, executionCatalogue, retrievalCatalogue })

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
