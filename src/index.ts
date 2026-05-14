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
import { seed } from './db/seed.js'
import { createContainer } from './container.js'
import { createApp } from './app.js'
import { startConsumers, startWorkers } from './startup.js'
import { PORT, DASHBOARD_URL } from './config.js'

const log = pino({ name: 'supaproxy' })

// --- Init ---
const pool = getPool()
await runMigrations(pool)
await seed(pool)

// --- Composition root (single-tenant, no options needed) ---
const container = createContainer(pool)

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
