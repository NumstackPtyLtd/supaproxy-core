# SupaProxy

[![CI](https://github.com/NumstackPtyLtd/supaproxy-server/actions/workflows/ci.yml/badge.svg)](https://github.com/NumstackPtyLtd/supaproxy-server/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

**One proxy for all your AI.** Route any LLM to any team through one governed layer. Guardrails, cost tracking, fraud detection, conversation analytics, without building bot infrastructure.

## What it does

SupaProxy sits between your teams and your AI models. You bring the LLM (Anthropic, OpenAI, etc.) and the data sources (via MCP). SupaProxy handles everything in between.

- **Workspaces**: each team gets an isolated AI proxy with its own model, prompt, knowledge, and guardrails
- **MCP connections**: plug in any MCP server (stdio or HTTP) and tools are discovered automatically
- **Multi-consumer**: Slack, WhatsApp, API, or any channel. One workspace, many entry points
- **Guardrails**: PII filtering, compliance rules, cost caps. Set at the org level, enforce per-workspace
- **Conversation lifecycle**: open, cold, closed with configurable timeouts and AI-generated follow-ups
- **Post-conversation analysis**: sentiment, resolution status, knowledge gaps, compliance violations, fraud indicators
- **Cost tracking**: per-query token counts, cost per conversation, monthly spend per workspace

## Quick start

Requires Docker.

```bash
git clone https://github.com/NumstackPtyLtd/supaproxy-server.git
cd supaproxy-server
./init.sh
```

This generates secrets, builds containers, and starts the API server:

- **API**: http://localhost:3001
- **API docs**: http://localhost:3001/docs
- **OpenAPI spec**: http://localhost:3001/api/openapi.json (import into Postman, Insomnia, etc.)
- **Health check**: http://localhost:3001/health

### Local dev (server on host, only MySQL/Redis in Docker)

```bash
git clone https://github.com/NumstackPtyLtd/supaproxy-server.git
cd supaproxy-server
pnpm install

# Configure environment (must be done before Docker; MySQL reads DB_PASSWORD from .env)
cp .env.example .env
# Edit .env: set JWT_SECRET and DB_PASSWORD
#   JWT_SECRET: openssl rand -hex 32
#   DB_PASSWORD: openssl rand -hex 16

# Start MySQL + Redis
docker compose up -d mysql redis

# Start the server
pnpm dev   # API on :3001
```

### Manual setup (without Docker)

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full dev setup with Node.js and pnpm.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│   Slack /    │────▶│   SupaProxy  │────▶│   MCP Server    │
│   WhatsApp   │     │   Server     │     │   (your tools)  │
│   API / SDK  │◀────│              │◀────│                 │
└─────────────┘     └──────────────┘     └─────────────────┘
```

- **Server**: Node.js (Hono + BullMQ). Agent loop, MCP client, consumers, lifecycle manager, conversation analysis
- **Database**: MySQL 8. Conversations, messages, audit logs, stats, knowledge sources, guardrails
- **Queue**: Redis + BullMQ. Cold messages, conversation stats generation

## SDK

Install the TypeScript client for building your own UI or integrations:

```bash
pnpm add @supaproxy/sdk
```

```typescript
import { SupaProxyClient } from '@supaproxy/sdk';

const client = new SupaProxyClient('http://localhost:3001');
const { workspaces } = await client.workspaces.list();
```

See [@supaproxy/sdk on npm](https://www.npmjs.com/package/@supaproxy/sdk) for full docs.

## Configuration

See `.env.example` for all environment variables.

## Tech stack

| Component | Stack |
|-----------|-------|
| Server | Node.js, TypeScript, Hono, BullMQ |
| Database | MySQL 8 |
| Queue | Redis 7 |
| AI | Any LLM (Anthropic, OpenAI, etc.) |
| MCP | Model Context Protocol SDK |
| Consumers | Slack Bolt, API |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for dev setup, code style, and PR process.

## License

MIT. See [LICENSE](LICENSE). Managed by Numstack Pty Ltd.
