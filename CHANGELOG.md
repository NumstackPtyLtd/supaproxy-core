# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [2.0.1] - 2026-05-22

### Fixed
- Extract `OAuthHttpClient` port; `fetch()` calls moved from use cases to `FetchOAuthHttpClient` infrastructure adapter
- `CreateWorkspaceUseCase` catches domain `ConflictError` instead of MySQL `ER_DUP_ENTRY`
- Domain JSON mappers (`parseComplianceViolations`, `parseKnowledgeGaps`, `parseStatsAnalysis`) replace inline parsing
- `StatsGenerator` uses `Duration` value object for timestamp calculations
- `formatKnowledgeContext` moved from `RetrieveKnowledgeUseCase` to `prompts.ts`
- `SECRET_KEY_PATTERNS`, `SECURITY_*` constants, `COLD_MESSAGE_TRANSCRIPT_LIMIT` moved to `defaults.ts`

## [2.0.0] - 2026-05-22

### Added
- Domain status enums: `ConversationStatus`, `StatsStatus`, `WorkspaceStatus`, `IntegrationStatus`
- Branded ID types: `WorkspaceId`, `ConversationId`, `OrganisationId`, `UserId`, `AuditLogId`, `TeamId`
- Rich aggregate entities: `Conversation`, `Workspace`, `Integration` with behaviour methods
- `ConversationQueryRepository` interface for dashboard/analytics queries
- `InvalidTransitionError` in `domain/shared/errors.ts`
- Value objects: `Email`, `Money`, `Duration` in `domain/shared/valueObjects.ts`
- Package export: `./domain/conversation-query`

### Changed
- `DatabaseAdapter` now requires `conversationQueryRepo` property
- `ConversationRepository` no longer includes dashboard query methods (moved to `ConversationQueryRepository`)
- Use cases (`ManageConversationUseCase`, `CloseConversationUseCase`, `DeleteWorkspaceUseCase`, `ManageIntegrationUseCase`) use aggregate entities
- Query use cases (`GetDashboardUseCase`, `ListConversationsUseCase`, `GetComplianceUseCase`, `GetKnowledgeUseCase`) accept `ConversationQueryRepository`

### Breaking
- Removed `STATUS_ACTIVE`, `STATUS_ARCHIVED`, `STATUS_OPEN`, `STATUS_CLOSED`, `STATUS_COLD`, `STATUS_PENDING`, `STATUS_COMPLETE`, `STATUS_FAILED` from `defaults.ts`. Use enums instead.
- `DatabaseAdapter` requires new `conversationQueryRepo` field. Adapter packages must provide this.

## [1.0.0] - 2026-05-20

### Added
- `DatabaseAdapter` interface for pluggable database backends
- `createContainer(infra, options)` accepts injected `DatabaseAdapter`
- Exported domain interfaces for all 11 repositories
- Exported application ports (ModelRepository, DatabaseAdapter)
- Exported defaults (status constants, pagination limits)
- `validateDatabaseAdapter()` test helper for adapter authors
- Composable server architecture: core + auth + database adapters

### Changed
- MySQL implementations extracted to `@supaproxy/mysql` package
- Auth extracted to `@supaproxy/auth` package
- Container no longer hardcodes database or auth implementations
- Migrations moved to database adapter packages

### Removed
- `src/infrastructure/persistence/mysql/` (moved to `@supaproxy/mysql`)
- `src/db/migrations.ts`, `src/db/types.ts`, `src/db/seed.ts` (moved to `@supaproxy/mysql`)

## [0.1.0] - 2026-04-25

### Added
- Workspace management with isolated AI proxies (model, prompt, tools, guardrails per workspace)
- MCP connection support (stdio and HTTP transports) with automatic tool discovery
- Slack consumer with Socket Mode support
- API consumer for programmatic access
- Conversation lifecycle management (open, cold, closed) with configurable timeouts
- AI-powered post-conversation analysis (sentiment, resolution, knowledge gaps, compliance, fraud)
- Cost tracking with per-query token counts and monthly spend
- Real-time dashboard with workspace overview, conversation viewer, and analytics
- Organisation-level settings and compliance rules
- JWT-based authentication
- Zod input validation on all API routes
- Typed database layer with zero `as any` casts
- Migration versioning system with schema tracking
- GitHub Actions CI pipeline (typecheck, test, build)
- Frontend logging wrapper (silenced in production)

### Security
- Required env vars with no fallback defaults; server refuses to start without them
- JWT secret minimum length enforcement (32 chars)
- DOMPurify sanitization on all rendered HTML including error fallbacks
- Hardcoded secrets removed from .env.example and docker-compose
