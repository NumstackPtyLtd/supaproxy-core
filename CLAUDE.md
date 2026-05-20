# SupaProxy

Central governance hub: [supaproxy](https://github.com/NumstackPtyLtd/supaproxy)

Open-source AI operations engine. Hono API server.

## Architecture (DDD + Clean Architecture)

The server follows Domain-Driven Design with strict layered architecture. Dependencies point inward only: presentation -> application -> domain <- infrastructure.

Core defines **interfaces only** for database persistence. Concrete implementations ship as separate adapter packages (e.g. `@supaproxy/mysql`). Core has zero SQL.

```
src/
├── domain/                          Pure business rules, ZERO external dependencies
│   ├── shared/
│   │   ├── EntityId.ts              ID generation (generateId, generateSlug, generateWorkspaceId)
│   │   └── errors.ts               Domain errors (NotFoundError, ConflictError, ValidationError, AuthenticationError)
│   ├── organisation/repository.ts   OrganisationRepository interface
│   ├── workspace/repository.ts      WorkspaceRepository interface
│   ├── conversation/repository.ts   ConversationRepository interface
│   ├── audit/repository.ts          AuditLogRepository interface
│   ├── guardrail/repository.ts      GuardrailEventRepository interface
│   ├── guardrail/policyRepository.ts GuardrailPolicyRepository interface
│   ├── integration/repository.ts    IntegrationRepository + EntryPointRepository interfaces
│   ├── knowledge/repository.ts      KnowledgeChunkRepository interface
│   └── prompt/repository.ts         PromptTemplateRepository interface
│
├── application/                     Use cases, orchestrate domain logic
│   ├── ports/                       Interfaces for external services (DIP)
│   │   ├── DatabaseAdapter.ts       Contract for database adapter packages
│   │   ├── AIProvider.ts            LLM abstraction
│   │   ├── McpClient.ts             MCP connection abstraction
│   │   ├── QueueService.ts          Job queue abstraction
│   │   ├── SessionStore.ts          Session storage abstraction
│   │   ├── VectorStore.ts           Vector database abstraction
│   │   ├── EmbeddingService.ts      Text embedding abstraction
│   │   ├── ModelRepository.ts       AI model listing
│   │   ├── PasswordService.ts       Password hashing abstraction
│   │   ├── TokenService.ts          JWT abstraction
│   │   ├── TenantService.ts         Multi-tenancy abstraction
│   │   ├── IntegrationTester.ts     External service testing
│   │   └── ConsumerPoster.ts        Consumer message posting
│   ├── organisation/                GetOrg, UpdateOrg, Settings, Users, Integration
│   ├── workspace/                   CRUD, Dashboard, Activity, Knowledge, Compliance, Health, Models
│   ├── conversation/                List, Detail, Close, Manage, Lifecycle
│   ├── connector/                   TestMcp, SaveMcp, BindChannel, ConnectConsumer
│   ├── query/                       ExecuteQueryUseCase (agent loop)
│   ├── routing/                     RouteMessageUseCase
│   ├── queue/                       ManageQueuesUseCase
│   ├── guardrail/                   ManagePolicies, SecurityOverview, PolicyOverrides
│   ├── integration/                 ManageIntegration, ManageEntryPoint
│   ├── knowledge/                   IndexKnowledge, RetrieveKnowledge
│   └── prompt/                      PromptResolver, SavePrompt
│
├── infrastructure/                  Implements non-database interfaces
│   ├── ai/                          EmbeddingServiceFactory
│   ├── mcp/McpClientFactoryImpl.ts  McpClientFactory implementation
│   ├── queue/BullMqService.ts       QueueService implementation (BullMQ)
│   ├── session/RedisSessionStore.ts SessionStore implementation (Redis)
│   ├── vector/LanceDBVectorStore.ts VectorStore implementation (LanceDB)
│   ├── guard/PreQueryGuardDepsImpl.ts Pre-query rate limiting (Redis)
│   ├── auth/                        ConsumerIntegrationTester
│   ├── consumers/                   ConsumerPosterRegistryImpl
│   └── tenant/NoOpTenantService.ts  Single-tenant default
│
├── presentation/                    Thin HTTP controllers
│   ├── middleware/                   auth.ts (JWT), validate.ts (Zod)
│   └── routes/                      org, workspaces, conversations, connectors, query, queues, prompts, guardrailPolicies, integrations, route
│
├── container.ts                     Composition root (accepts DatabaseAdapter + options)
├── config.ts                        requireEnv(), no fallbacks
├── defaults.ts                      Named constants (status values, limits, defaults)
├── index.ts                         Server entrypoint (composes core + mysql + auth)
├── server.ts                        Public API exports for cloud overlay
├── app.ts                           Hono app factory
├── startup.ts                       Consumer and worker startup
├── shared/                          Cross-cutting types (exported to SDK)
├── db/pool.ts                       MySQL pool factory (used by index.ts)
├── openapi.ts                       OpenAPI/Redoc spec
├── GuardrailResolver.ts             Plugin resolution per workspace
└── observability/audit.ts           File-based audit logging
```

### Pluggable Database

Core defines the `DatabaseAdapter` interface (`application/ports/DatabaseAdapter.ts`) with 11 repository fields. Database adapter packages implement this interface:

```typescript
import { createMysqlInfra, runMigrations } from '@supaproxy/mysql'

const pool = getPool()
await runMigrations(pool)
const infra = createMysqlInfra(pool)  // returns DatabaseAdapter
const container = createContainer(infra, { pool, ...options })
```

The default adapter is `@supaproxy/mysql`. Community adapters (`@supaproxy/postgres`, `@supaproxy/sqlite`) implement the same interface.

### Exported interfaces for adapter packages

Core exports domain interfaces and ports so adapter packages can import them:

| Export path | Contents |
|---|---|
| `@supaproxy/core/domain/organisation` | OrganisationRepository + data types |
| `@supaproxy/core/domain/workspace` | WorkspaceRepository + data types |
| `@supaproxy/core/domain/conversation` | ConversationRepository + data types |
| `@supaproxy/core/domain/audit` | AuditLogRepository + data types |
| `@supaproxy/core/domain/guardrail` | GuardrailEventRepository + data types |
| `@supaproxy/core/domain/guardrail-policy` | GuardrailPolicyRepository + data types |
| `@supaproxy/core/domain/integration` | IntegrationRepository + EntryPointRepository |
| `@supaproxy/core/domain/knowledge` | KnowledgeChunkRepository + data types |
| `@supaproxy/core/domain/prompt` | PromptTemplateRepository + data types |
| `@supaproxy/core/ports/model` | ModelRepository + data types |
| `@supaproxy/core/ports/database` | DatabaseAdapter interface |
| `@supaproxy/core/defaults` | Status constants, pagination limits, defaults |
| `@supaproxy/core/domain/errors` | Domain error classes |
| `@supaproxy/core/testing/validate-adapter` | Adapter validation test suite |

### Cloud Extension Point

The server supports pluggable multi-tenancy via `TenantService` (in `application/ports/TenantService.ts`):

- **Self-hosted**: `NoOpTenantService`, single-tenant, no org scoping
- **Cloud**: Injects `CloudTenantService` from the private `supaproxy-cloud` repo

The `createContainer()` function accepts an optional `tenantService` parameter. All routes delegate workspace access checks to this service. Self-hosters never need to think about this; it is transparent.

When adding new routes that access workspace data, always use `guardWorkspace()` to delegate access checks to the tenant service.

## Dependency flow (STRICT)

```
Presentation -> Application -> Domain <- Infrastructure
  (routes)      (use cases)   (interfaces)  (implementations)
```

Rules:
- **Domain** imports NOTHING from application, infrastructure, or presentation.
- **Application** imports from domain and application/ports ONLY. Never from infrastructure.
- **Infrastructure** implements domain interfaces and application ports.
- **Presentation** calls application use cases. Never imports from infrastructure directly.
- **container.ts** is the ONLY place where concrete implementations are wired.
- **Core has zero SQL.** All database queries live in adapter packages (e.g. `@supaproxy/mysql`).

## Related Repos

| Repo | Visibility | Purpose |
|---|---|---|
| supaproxy-core (this) | Public (MIT) | Core: domain interfaces, use cases, routes |
| supaproxy-mysql | Public (MIT) | Default database adapter (`@supaproxy/mysql`) |
| supaproxy-auth | Public (MIT) | Default auth adapter (`@supaproxy/auth`) |
| supaproxy-sdk | Public (MIT) | TypeScript SDK (`@supaproxy/sdk` on npm) |
| supaproxy-dashboard | Private | Astro + React frontend |
| supaproxy-docs | Private | Documentation site |
| supaproxy-cloud | Private | Cloud multi-tenancy (CloudTenantService) |

## Start Dev

```bash
pnpm install                       # Dependencies
cp .env.example .env               # Configure env vars
docker compose up -d mysql redis   # MySQL + Redis
pnpm dev                           # API on :3001
```

## Stack

| Layer | Tech |
|---|---|
| Backend | Hono + TypeScript |
| Auth | @supaproxy/auth (JWT cookies, bcrypt) |
| Database | @supaproxy/mysql (MySQL 8, Docker port 3308) |
| Validation | Zod schemas via `parseBody()` |
| Queue | Redis 7 + BullMQ (Docker, port 6380) |
| Vectors | LanceDB (local file storage) |
| Sessions | Redis (ioredis) |
| Consumers | @supaproxy/consumers (Slack, WhatsApp, API) |

## Code Rules

### DDD and SOLID (MANDATORY)

#### Single Responsibility Principle (SRP)
- **One use case per class.** Each use case has a single `execute()` method.
- **Route handlers do three things only:** parse request, call use case, format response.
- **Repositories handle persistence only.** No business logic in repository implementations.

#### Open/Closed Principle (OCP)
- **New consumer types** plug in via `ConsumerTypeHandler` interface without modifying existing code.
- **New AI providers** plug in via `AIProvider` port without modifying use cases.
- **New database backends** implement the `DatabaseAdapter` interface as a separate package.

#### Liskov Substitution Principle (LSP)
- All implementations must satisfy their interface contracts completely.
- Any infrastructure adapter can be swapped without changing application or domain code.

#### Interface Segregation Principle (ISP)
- Ports are focused: `PasswordService`, `TokenService`, `AIProvider`, `McpClient`, `QueueService`, `DatabaseAdapter`.
- No god interfaces. Each port serves a specific concern.

#### Dependency Inversion Principle (DIP)
- Domain and application depend on abstractions (interfaces), never concrete implementations.
- All database access goes through repository interfaces defined in `domain/`.
- All external service access goes through port interfaces in `application/ports/`.
- `container.ts` is the composition root that wires implementations to interfaces.

### Layer boundary rules

- **NEVER import from `infrastructure/` in domain or application code.**
- **NEVER put SQL queries in core.** SQL lives in adapter packages.
- **NEVER put business logic in route handlers.** Extract to a use case.
- **NEVER instantiate infrastructure classes outside `container.ts`.**

### Test-Driven Development (MANDATORY)

All code changes follow red-green-refactor. Tests are written BEFORE implementation.

- **Tests FIRST.** Never write implementation before the test exists and fails.
- **Every use case has a test file.** No exceptions. Colocated next to the source file.
- **Every domain function has a test.** No exceptions.
- **Every infrastructure adapter has a test.** No exceptions for adapters with testable logic.
- **All tests must pass before committing.** Run `npx vitest run` before every commit.
- **Mock at boundaries.** Use mock factories from `src/__tests__/mocks.ts`.
- **Run `/tdd` for the full TDD workflow guide.**

### Clean Code

- **Functions do one thing.** If a function needs a comment explaining what it does, it does too much.
- **No long parameter lists.** Use input objects for functions with more than 3 parameters.
- **Meaningful names.** Use case classes describe the action: `CreateWorkspaceUseCase`, not `WorkspaceService`.
- **No dead code.** Delete unused functions, imports, and types.
- **Error handling is explicit.** Domain errors (`NotFoundError`, `ConflictError`) flow from use cases to route handlers.

### No Hardcoded Values
- **No env var fallbacks.** Use `requireEnv()` which throws if missing.
- **No hardcoded API URLs, secrets, or magic numbers.**
- **No hardcoded model IDs.** Model options come from the DB.

### Provider Agnosticism
- **No AI provider names in user-facing output.**
- **No provider-specific token formats as placeholders.**

### Type Safety
- **No `any` types.** Create interfaces for all data.
- **No `as any` casts.** Define proper interfaces.

### Error Handling
- **No empty catch blocks.** Every `.catch()` must log the error.
- **Check `res.ok` before parsing.** Every outbound `fetch` checks response status.
- **Domain errors for business rule violations.** Use `NotFoundError`, `ConflictError`, `ValidationError`.

### Security
- **Never commit `.env` files.**
- **Use bcrypt for password hashing.**
- **JWT secret required, minimum 32 characters.**
- **Cookie `secure: true` in production.**
- **Error responses must not leak internals.**

## Skills

| Skill | Purpose |
|---|---|
| `/tdd` | TDD workflow: red-green-refactor cycle, test patterns, mock helpers |
| `/add-api-route` | Scaffold a new endpoint: repository method, use case, route handler |
| `/add-consumer` | Add a new consumer type with DDD architecture |
| `/audit-code` | Full codebase scan: DDD violations, SOLID, types, errors, security |
| `/prod-ready` | Pre-deploy: cookies, error leaks, missing auth, layer violations |
| `/no-defaults` | Env var enforcement: no fallback patterns |
| `/debug-mcp` | Diagnose MCP connection failures |
| `/debug-clients` | Diagnose consumer connectivity |
| `/restart-servers` | Restart Hono dev server and verify health |

## Contributing

### Adding a new endpoint

Run `/add-api-route` or follow this pattern:

1. **Domain**: add method to the relevant repository interface in `domain/`
2. **Adapter**: implement the method in `@supaproxy/mysql` (and any other adapter packages)
3. **Application**: create a use case class in `application/` that calls the repository
4. **Presentation**: add a thin route handler in `presentation/routes/` that calls the use case
5. **Container**: wire the use case in `container.ts` and inject into the route factory

### Adding a new repository

1. Create the interface in `domain/{name}/repository.ts`
2. Add it to the `DatabaseAdapter` interface in `application/ports/DatabaseAdapter.ts`
3. Add the export to `package.json` exports
4. Implement in `@supaproxy/mysql` (create `Mysql{Name}Repository.ts` + `{Name}RowMappers.ts`)
5. Add to `createMysqlInfra()` in the mysql package
6. Update `validateDatabaseAdapter()` test in `DatabaseAdapter.test.ts`

### Adding a new use case

1. Create `application/{domain}/{VerbNounUseCase}.ts`
2. Constructor takes repository interfaces and port interfaces
3. Single `execute()` method with typed input and output
4. Throw domain errors (`NotFoundError`, `ConflictError`) for business rule violations
5. Wire in `container.ts`

### Adding a new consumer

Run `/add-consumer` or:
1. Create `infrastructure/consumers/{Name}Consumer.ts`
2. Accept the container as a dependency
3. Use `container.executeQueryUseCase` for queries, `container.conversationRepo` for lookups
4. Register with `container.posterRegistry` for lifecycle messages
5. Start from `index.ts` via container
