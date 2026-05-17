/**
 * Public API for @supaproxy/core.
 *
 * This is what the cloud overlay imports:
 *
 *   import { createContainer, createApp, startConsumers, startWorkers, getPool, runMigrations } from '@supaproxy/core/server'
 *
 * The open-source index.ts uses these same functions directly.
 */
export { createContainer, type Container } from './container.js'
export { createApp } from './app.js'
export { startConsumers, startWorkers } from './startup.js'
export { getPool } from './db/pool.js'
export { runMigrations } from './db/migrations.js'
export { PORT, CORS_ORIGINS, DASHBOARD_URL } from './config.js'
export type { TenantService } from './application/ports/TenantService.js'
