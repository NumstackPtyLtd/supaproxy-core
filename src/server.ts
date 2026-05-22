/**
 * Public API for @supaproxy/core.
 *
 * This is what the cloud overlay imports:
 *
 *   import { createContainer, createApp, startConsumers, startWorkers } from '@supaproxy/core/server'
 *
 * The open-source index.ts uses these same functions directly.
 */
export { createContainer, type Container } from './container.js'
export { createApp } from './app.js'
export { startConsumers, startWorkers, buildQueueConfigs } from './startup.js'
export { PORT, CORS_ORIGINS, DASHBOARD_URL, JWT_SECRET, IS_PRODUCTION, COOKIE_DOMAIN, QUEUE_HOST, QUEUE_PORT, SESSION_HOST, SESSION_PORT, DATABASE_HOST, DATABASE_PORT, DATABASE_USER, DATABASE_PASSWORD, DATABASE_NAME, VECTOR_STORE_PATH } from './config.js'
export type { TenantService } from './application/ports/TenantService.js'
export type { DatabaseAdapter } from './application/ports/DatabaseAdapter.js'
export type { PluginOAuthConfig, OAuthTokens, OAuthResource } from './application/ports/OAuthProvider.js'
export type { OAuthCredentialPort, OAuthCredentials } from './application/oauth/OAuthCredentialService.js'
export { generateId, generateWorkspaceId } from './domain/shared/EntityId.js'
export { DEFAULT_SYSTEM_PROMPT, QUEUE_KNOWLEDGE_SYNC, KNOWLEDGE_SYNC_CONCURRENCY } from './defaults.js'
export type { QueueConfig } from './application/ports/QueueService.js'
export { RefreshOAuthTokenUseCase } from './application/oauth/RefreshOAuthTokenUseCase.js'
