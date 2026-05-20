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
export { PORT, CORS_ORIGINS, DASHBOARD_URL, JWT_SECRET, IS_PRODUCTION, COOKIE_DOMAIN } from './config.js'
export type { TenantService } from './application/ports/TenantService.js'
export type { DatabaseAdapter } from './application/ports/DatabaseAdapter.js'
export { generateId, generateWorkspaceId } from './domain/shared/EntityId.js'
export { DEFAULT_SYSTEM_PROMPT } from './defaults.js'
