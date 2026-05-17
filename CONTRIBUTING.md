# Contributing to SupaProxy

Thanks for your interest in contributing! This guide will help you get started.

## Development setup

### Prerequisites

- Node.js 22+
- pnpm 9+
- Docker (for MySQL and Redis)

### Getting started

```bash
git clone https://github.com/NumstackPtyLtd/supaproxy-core.git
cd supaproxy-core
pnpm install

# Configure environment (must be done before Docker -- MySQL reads DB_PASSWORD from .env)
cp .env.example .env
# Edit .env:
#   JWT_SECRET: openssl rand -hex 32
#   DB_PASSWORD: openssl rand -hex 16

# Start MySQL + Redis
docker compose up -d mysql redis

# Start the server
pnpm dev   # API on :3001
```

## Project structure (DDD)

The server follows Domain-Driven Design with strict layered architecture. Dependencies point inward only.

```
src/
├── domain/                 Pure business rules, ZERO external dependencies
│   ├── shared/             Value objects (EntityId), domain errors
│   ├── organisation/       OrganisationRepository interface
│   ├── workspace/          WorkspaceRepository interface
│   ├── conversation/       ConversationRepository interface
│   └── audit/              AuditLogRepository interface
│
├── application/            Use cases (one class, one execute() method)
│   ├── ports/              Interfaces for external services
│   ├── auth/               SignupUseCase, LoginUseCase
│   ├── organisation/       Org CRUD, settings, users
│   ├── workspace/          Workspace CRUD, dashboard, connectors
│   ├── conversation/       Lifecycle, close, manage
│   ├── connector/          MCP and consumer connectors
│   ├── query/              Agent loop (ExecuteQueryUseCase)
│   └── queue/              Queue management
│
├── infrastructure/         Implements all interfaces
│   ├── persistence/mysql/  MySQL repository implementations
│   ├── ai/                 AnthropicProvider
│   ├── mcp/                McpClientFactory
│   ├── queue/              BullMqService
│   ├── auth/               Bcrypt, JWT, Slack tester
│   └── consumers/          SlackConsumer
│
├── presentation/           Thin HTTP controllers
│   ├── middleware/          Auth (JWT), validation (Zod)
│   └── routes/             Route handlers (parse, call use case, respond)
│
├── container.ts            Composition root (all DI wiring)
├── config.ts               requireEnv(), no fallbacks
├── index.ts                Server entrypoint
├── shared/                 Types exported to SDK
└── db/                     Pool, migrations, seed
```

### Layer rules

- **domain/** imports nothing from other layers.
- **application/** imports from domain/ and application/ports/ only.
- **infrastructure/** implements domain interfaces and application ports.
- **presentation/** calls application use cases. Never imports infrastructure.
- **container.ts** is the only place where concrete classes are instantiated.

## Adding a new feature

### New API endpoint

Every endpoint touches four layers:

1. **Domain**: add method to repository interface in `domain/{aggregate}/repository.ts`
2. **Infrastructure**: implement in `infrastructure/persistence/mysql/Mysql{Aggregate}Repository.ts`
3. **Application**: create `application/{domain}/{VerbNounUseCase}.ts` with test file
4. **Presentation**: add thin handler in `presentation/routes/{module}.ts`
5. **Container**: wire use case in `container.ts`

### Test-Driven Development

Tests come first. Write the test, watch it fail, then implement.

```bash
pnpm test                # Run all tests
pnpm test:watch          # Watch mode
pnpm test:coverage       # Run with coverage thresholds
```

Mock helpers for all repository interfaces and ports live in `src/__tests__/mocks.ts`.

## Code style

All code rules are documented in `CLAUDE.md`. The key ones:

- **No `any` types.** Create interfaces for all data.
- **No env var fallbacks.** Use `requireEnv()` -- it throws if missing.
- **No SQL outside infrastructure.** All queries in `infrastructure/persistence/`.
- **No business logic in route handlers.** Extract to a use case.
- **Tests for every use case.** Colocated `.test.ts` files.

## Pull request process

1. Fork the repo and create a branch from `main`
2. Write tests first, then implementation (TDD)
3. Ensure TypeScript compiles: `npx tsc --noEmit`
4. Run tests with coverage: `pnpm test:coverage`
5. Open a PR against `main`

### PR checklist

- [ ] TypeScript compiles cleanly
- [ ] All tests pass
- [ ] Coverage thresholds met (80% lines, 70% branches)
- [ ] No `as any` or `: any` types introduced
- [ ] No SQL outside `infrastructure/persistence/`
- [ ] No infrastructure imports in domain or application layers
- [ ] New use cases have colocated test files

## Commit messages

Use conventional commits in imperative form:

```
feat: add workspace analytics endpoint
fix: correct cost estimation for unknown models
refactor: extract conversation lifecycle to use case
test: add coverage for signup flow
```

## `.claude/` directory

The `.claude/` directory contains Claude Code configuration -- skills (dev automation scripts), hooks, and settings. It is optional for development. You do not need Claude Code to contribute.

## Questions?

Open a [GitHub Discussion](https://github.com/NumstackPtyLtd/supaproxy-core/discussions) or file an issue.
