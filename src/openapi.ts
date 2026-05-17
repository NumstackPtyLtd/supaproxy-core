import { z } from 'zod'
import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import { html } from 'hono/html'

// ── Response schemas ──────────────────────────────────────────────

const ErrorResponse = z.object({ error: z.string() }).openapi('ErrorResponse')
const OkResponse = z.object({ status: z.literal('ok') }).openapi('OkResponse')

const UserInfo = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  role: z.string(),
}).openapi('UserInfo')

const SignupResponse = z.object({
  status: z.literal('ok'),
  org_id: z.string(),
  user_id: z.string(),
  workspace_id: z.string(),
}).openapi('SignupResponse')

const LoginResponse = z.object({
  status: z.literal('ok'),
  user: UserInfo,
}).openapi('LoginResponse')

const SessionResponse = z.object({
  user: UserInfo.nullable(),
}).openapi('SessionResponse')

const OrgResponse = z.object({
  org: z.object({ id: z.string(), name: z.string(), slug: z.string(), created_at: z.string() }),
}).openapi('OrgResponse')

const OrgSettingsResponse = z.object({
  settings: z.record(z.string()),
  configured: z.record(z.boolean()),
}).openapi('OrgSettingsResponse')

const UsersListResponse = z.object({
  users: z.array(z.object({ id: z.string(), name: z.string(), email: z.string(), org_role: z.string(), created_at: z.string() })),
}).openapi('UsersListResponse')

const QueuesListResponse = z.object({
  queues: z.array(z.object({ name: z.string() }).passthrough()),
}).openapi('QueuesListResponse')

const WorkspaceShort = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  model: z.string().nullable(),
  created_at: z.string(),
  team: z.string().nullable(),
  connection_count: z.number(),
  tool_count: z.number(),
  queries_today: z.number(),
  cost_mtd: z.number(),
}).openapi('WorkspaceShort')

const WorkspacesListResponse = z.object({
  workspaces: z.array(WorkspaceShort),
}).openapi('WorkspacesListResponse')

const WorkspaceDetailResponse = z.object({
  workspace: z.object({}).passthrough(),
  connections: z.array(z.object({}).passthrough()),
  tools: z.array(z.object({}).passthrough()),
  knowledge: z.array(z.object({}).passthrough()),
  guardrails: z.array(z.object({}).passthrough()),
  consumers: z.array(z.object({}).passthrough()),
  permissions: z.array(z.object({}).passthrough()),
  stats: z.object({}).passthrough(),
}).openapi('WorkspaceDetailResponse')

const ConversationsListResponse = z.object({
  conversations: z.array(z.object({}).passthrough()),
  total: z.number(),
  filters: z.object({
    status: z.array(z.string()),
    consumer: z.array(z.string()),
    category: z.array(z.string()),
    resolution: z.array(z.string()),
  }),
}).openapi('ConversationsListResponse')

const ConversationDetailResponse = z.object({
  conversation: z.object({}).passthrough(),
  messages: z.array(z.object({}).passthrough()),
  stats: z.object({}).passthrough().nullable(),
}).openapi('ConversationDetailResponse')

const QueryResponse = z.object({
  answer: z.string(),
  tools_called: z.array(z.string()),
  connections_hit: z.array(z.string()),
  tokens: z.object({ input: z.number(), output: z.number() }),
  cost_usd: z.number(),
  duration_ms: z.number(),
  error: z.string().optional(),
  conversation_id: z.string(),
  session_id: z.string(),
}).openapi('QueryResponse')

const McpTestResponse = z.object({
  ok: z.boolean(),
  tools: z.number().optional(),
  server: z.string().optional(),
  toolNames: z.array(z.string()).optional(),
  error: z.string().optional(),
}).openapi('McpTestResponse')

const HealthResponse = z.object({
  status: z.string(),
  setup_complete: z.boolean(),
  workspaces: z.number(),
  ai_configured: z.boolean(),
  connections: z.number(),
}).openapi('HealthResponse')

const ModelsResponse = z.object({
  models: z.array(z.object({ id: z.string(), label: z.string(), is_default: z.boolean() })),
}).openapi('ModelsResponse')

const DashboardResponse = z.object({
  tickets: z.object({}).passthrough(),
  sentiment: z.object({}).passthrough(),
  compliance: z.object({}).passthrough(),
  knowledge_gaps: z.object({}).passthrough(),
  resolution: z.object({}).passthrough().nullable(),
  cost: z.object({}).passthrough().nullable(),
  usage: z.object({}).passthrough().nullable(),
  recent_conversations: z.array(z.object({}).passthrough()),
  categories: z.array(z.object({}).passthrough()),
  channels: z.array(z.object({}).passthrough()),
}).openapi('DashboardResponse')

const ActivityResponse = z.object({
  activity: z.array(z.object({}).passthrough()),
  total: z.number(),
}).openapi('ActivityResponse')

// ── Request schemas ───────────────────────────────────────────────

const SignupBody = z.object({
  org_name: z.string().min(1).max(255),
  admin_name: z.string().min(1).max(255),
  admin_email: z.string().email().max(255),
  admin_password: z.string().min(8).max(255),
  workspace_name: z.string().min(1).max(255),
  team_name: z.string().min(1).max(255),
  system_prompt: z.string().max(10000).optional(),
}).openapi('SignupBody')

const LoginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
}).openapi('LoginBody')

const CreateWorkspaceBody = z.object({
  name: z.string().min(1).max(255),
  team_id: z.string().max(255).optional(),
  team_name: z.string().max(255).optional(),
  system_prompt: z.string().max(10000).optional(),
  org_id: z.string().max(255).optional(),
}).openapi('CreateWorkspaceBody')

const UpdateWorkspaceBody = z.object({
  name: z.string().min(1).max(255).optional(),
  model: z.string().min(1).max(255).optional(),
  system_prompt: z.string().max(10000).optional(),
  cold_timeout_minutes: z.number().int().min(1).max(10080).nullable().optional(),
  close_timeout_minutes: z.number().int().min(1).max(10080).nullable().optional(),
}).openapi('UpdateWorkspaceBody')

const QueryBody = z.object({
  query: z.string().min(1).max(10000),
  session_id: z.string().max(255).optional(),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).max(100).optional(),
}).openapi('QueryBody')

const McpTestBody = z.object({
  transport: z.enum(['http', 'stdio']).optional(),
  url: z.string().url().max(2048).optional(),
  command: z.string().max(1000).optional(),
}).openapi('McpTestBody')

const McpSaveBody = z.object({
  workspace_id: z.string().min(1).max(255),
  name: z.string().min(1).max(255),
  transport: z.enum(['http', 'stdio']).optional(),
  url: z.string().url().max(2048).optional(),
  command: z.string().max(1000).optional(),
  args: z.array(z.string()).max(50).optional(),
}).openapi('McpSaveBody')

// ── OpenAPI spec app ──────────────────────────────────────────────

const docs = new OpenAPIHono()

// Helper to define a documented route that does nothing (proxied to real app)
const tag = (t: string) => [t]

// --- Health & Models ---

docs.openapi(createRoute({
  method: 'get', path: '/health', tags: tag('System'),
  summary: 'Health check',
  responses: { 200: { description: 'Server health status', content: { 'application/json': { schema: HealthResponse } } } },
}), (c) => c.json({} as never))

docs.openapi(createRoute({
  method: 'get', path: '/api/models', tags: tag('System'),
  summary: 'List available AI models',
  responses: { 200: { description: 'Available models', content: { 'application/json': { schema: ModelsResponse } } } },
}), (c) => c.json({} as never))

// --- Auth ---

docs.openapi(createRoute({
  method: 'post', path: '/api/signup', tags: tag('Auth'),
  summary: 'Create account, organisation, and first workspace',
  request: { body: { content: { 'application/json': { schema: SignupBody } } } },
  responses: {
    200: { description: 'Account created', content: { 'application/json': { schema: SignupResponse } } },
    400: { description: 'Validation error or duplicate email', content: { 'application/json': { schema: ErrorResponse } } },
  },
}), (c) => c.json({} as never))

docs.openapi(createRoute({
  method: 'post', path: '/api/auth/login', tags: tag('Auth'),
  summary: 'Log in with email and password',
  description: 'Returns JSON with user info and sets httpOnly session cookie. Also accepts form-encoded POST from browser forms (redirects to dashboard).',
  request: { body: { content: { 'application/json': { schema: LoginBody } } } },
  responses: {
    200: { description: 'Login successful', content: { 'application/json': { schema: LoginResponse } } },
    400: { description: 'Missing fields', content: { 'application/json': { schema: ErrorResponse } } },
    401: { description: 'Invalid credentials', content: { 'application/json': { schema: ErrorResponse } } },
  },
}), (c) => c.json({} as never))

docs.openapi(createRoute({
  method: 'get', path: '/api/auth/session', tags: tag('Auth'),
  summary: 'Get current session',
  responses: { 200: { description: 'Current user or null', content: { 'application/json': { schema: SessionResponse } } } },
}), (c) => c.json({} as never))

docs.openapi(createRoute({
  method: 'get', path: '/api/auth/logout', tags: tag('Auth'),
  summary: 'Log out and clear session cookie',
  responses: { 200: { description: 'Logged out', content: { 'application/json': { schema: OkResponse } } } },
}), (c) => c.json({} as never))

// --- Organisation ---

docs.openapi(createRoute({
  method: 'get', path: '/api/org', tags: tag('Organisation'),
  summary: 'Get current organisation',
  security: [{ cookieAuth: [] }],
  responses: { 200: { description: 'Organisation details', content: { 'application/json': { schema: OrgResponse } } } },
}), (c) => c.json({} as never))

docs.openapi(createRoute({
  method: 'put', path: '/api/org', tags: tag('Organisation'),
  summary: 'Update organisation name',
  security: [{ cookieAuth: [] }],
  request: { body: { content: { 'application/json': { schema: z.object({ name: z.string().min(1).max(255) }) } } } },
  responses: { 200: { description: 'Updated', content: { 'application/json': { schema: OkResponse } } } },
}), (c) => c.json({} as never))

docs.openapi(createRoute({
  method: 'get', path: '/api/org/settings', tags: tag('Organisation'),
  summary: 'Get all organisation settings',
  security: [{ cookieAuth: [] }],
  responses: { 200: { description: 'Settings and configured flags', content: { 'application/json': { schema: OrgSettingsResponse } } } },
}), (c) => c.json({} as never))

docs.openapi(createRoute({
  method: 'put', path: '/api/org/settings/{key}', tags: tag('Organisation'),
  summary: 'Update a single organisation setting',
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({ key: z.string().openapi({ param: { name: 'key', in: 'path' } }) }),
    body: { content: { 'application/json': { schema: z.object({ value: z.string().max(5000) }) } } },
  },
  responses: { 200: { description: 'Updated', content: { 'application/json': { schema: OkResponse } } } },
}), (c) => c.json({} as never))


docs.openapi(createRoute({
  method: 'get', path: '/api/org/users', tags: tag('Organisation'),
  summary: 'List organisation users',
  security: [{ cookieAuth: [] }],
  responses: { 200: { description: 'User list', content: { 'application/json': { schema: UsersListResponse } } } },
}), (c) => c.json({} as never))

// --- Queues ---

docs.openapi(createRoute({
  method: 'get', path: '/api/org/queues', tags: tag('Queues'),
  summary: 'List all BullMQ queues with job counts',
  security: [{ cookieAuth: [] }],
  responses: { 200: { description: 'Queue list', content: { 'application/json': { schema: QueuesListResponse } } } },
}), (c) => c.json({} as never))

docs.openapi(createRoute({
  method: 'get', path: '/api/org/queues/{name}/failed', tags: tag('Queues'),
  summary: 'Get failed jobs for a queue',
  security: [{ cookieAuth: [] }],
  request: { params: z.object({ name: z.string().openapi({ param: { name: 'name', in: 'path' } }) }) },
  responses: { 200: { description: 'Failed jobs', content: { 'application/json': { schema: z.object({ jobs: z.array(z.object({}).passthrough()) }) } } } },
}), (c) => c.json({} as never))

docs.openapi(createRoute({
  method: 'post', path: '/api/org/queues/{name}/retry-all', tags: tag('Queues'),
  summary: 'Retry all failed jobs in a queue',
  security: [{ cookieAuth: [] }],
  request: { params: z.object({ name: z.string().openapi({ param: { name: 'name', in: 'path' } }) }) },
  responses: { 200: { description: 'Retried', content: { 'application/json': { schema: z.object({ status: z.literal('ok'), retried: z.number() }) } } } },
}), (c) => c.json({} as never))

docs.openapi(createRoute({
  method: 'post', path: '/api/org/queues/{name}/drain', tags: tag('Queues'),
  summary: 'Drain a queue (remove all jobs)',
  security: [{ cookieAuth: [] }],
  request: { params: z.object({ name: z.string().openapi({ param: { name: 'name', in: 'path' } }) }) },
  responses: { 200: { description: 'Drained', content: { 'application/json': { schema: OkResponse } } } },
}), (c) => c.json({} as never))

// --- Workspaces ---

docs.openapi(createRoute({
  method: 'get', path: '/api/teams', tags: tag('Workspaces'),
  summary: 'List all teams',
  responses: { 200: { description: 'Team list', content: { 'application/json': { schema: z.object({ teams: z.array(z.object({ id: z.string(), name: z.string() })) }) } } } },
}), (c) => c.json({} as never))

docs.openapi(createRoute({
  method: 'post', path: '/api/workspaces', tags: tag('Workspaces'),
  summary: 'Create a new workspace',
  request: { body: { content: { 'application/json': { schema: CreateWorkspaceBody } } } },
  responses: {
    200: { description: 'Workspace created', content: { 'application/json': { schema: z.object({ id: z.string(), name: z.string(), status: z.literal('active') }) } } },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorResponse } } },
  },
}), (c) => c.json({} as never))

docs.openapi(createRoute({
  method: 'get', path: '/api/workspaces', tags: tag('Workspaces'),
  summary: 'List all workspaces with stats',
  responses: { 200: { description: 'Workspace list', content: { 'application/json': { schema: WorkspacesListResponse } } } },
}), (c) => c.json({} as never))

docs.openapi(createRoute({
  method: 'get', path: '/api/workspaces/{id}', tags: tag('Workspaces'),
  summary: 'Get workspace detail with connections, tools, knowledge, guardrails, consumers, and stats',
  request: { params: z.object({ id: z.string().openapi({ param: { name: 'id', in: 'path' } }) }) },
  responses: { 200: { description: 'Workspace detail', content: { 'application/json': { schema: WorkspaceDetailResponse } } } },
}), (c) => c.json({} as never))

docs.openapi(createRoute({
  method: 'get', path: '/api/workspaces/{id}/summary', tags: tag('Workspaces'),
  summary: 'Get workspace summary (name, model, prompts, timeouts)',
  request: { params: z.object({ id: z.string().openapi({ param: { name: 'id', in: 'path' } }) }) },
  responses: { 200: { description: 'Workspace summary', content: { 'application/json': { schema: z.object({ workspace: z.object({}).passthrough() }) } } } },
}), (c) => c.json({} as never))

docs.openapi(createRoute({
  method: 'put', path: '/api/workspaces/{id}', tags: tag('Workspaces'),
  summary: 'Update workspace settings',
  request: {
    params: z.object({ id: z.string().openapi({ param: { name: 'id', in: 'path' } }) }),
    body: { content: { 'application/json': { schema: UpdateWorkspaceBody } } },
  },
  responses: { 200: { description: 'Updated', content: { 'application/json': { schema: OkResponse } } } },
}), (c) => c.json({} as never))

docs.openapi(createRoute({
  method: 'get', path: '/api/workspaces/{id}/activity', tags: tag('Workspaces'),
  summary: 'Get workspace activity log (queries, tool calls, costs)',
  request: {
    params: z.object({ id: z.string().openapi({ param: { name: 'id', in: 'path' } }) }),
    query: z.object({
      limit: z.string().optional().openapi({ param: { name: 'limit', in: 'query' } }),
      offset: z.string().optional().openapi({ param: { name: 'offset', in: 'query' } }),
    }),
  },
  responses: { 200: { description: 'Activity log', content: { 'application/json': { schema: ActivityResponse } } } },
}), (c) => c.json({} as never))

docs.openapi(createRoute({
  method: 'get', path: '/api/workspaces/{id}/dashboard', tags: tag('Workspaces'),
  summary: 'Get workspace dashboard (tickets, sentiment, compliance, costs, usage)',
  request: { params: z.object({ id: z.string().openapi({ param: { name: 'id', in: 'path' } }) }) },
  responses: { 200: { description: 'Dashboard data', content: { 'application/json': { schema: DashboardResponse } } } },
}), (c) => c.json({} as never))

// --- Connections ---

docs.openapi(createRoute({
  method: 'get', path: '/api/workspaces/{id}/connections', tags: tag('Connections'),
  summary: 'List connections and tools for a workspace',
  request: { params: z.object({ id: z.string().openapi({ param: { name: 'id', in: 'path' } }) }) },
  responses: { 200: { description: 'Connections and tools', content: { 'application/json': { schema: z.object({ connections: z.array(z.object({}).passthrough()), tools: z.array(z.object({}).passthrough()) }) } } } },
}), (c) => c.json({} as never))

docs.openapi(createRoute({
  method: 'delete', path: '/api/connections/{id}', tags: tag('Connections'),
  summary: 'Delete a connection and its tools',
  request: { params: z.object({ id: z.string().openapi({ param: { name: 'id', in: 'path' } }) }) },
  responses: { 200: { description: 'Deleted', content: { 'application/json': { schema: OkResponse } } } },
}), (c) => c.json({} as never))

// --- Consumers ---

docs.openapi(createRoute({
  method: 'get', path: '/api/workspaces/{id}/consumers', tags: tag('Consumers'),
  summary: 'List consumers for a workspace',
  request: { params: z.object({ id: z.string().openapi({ param: { name: 'id', in: 'path' } }) }) },
  responses: { 200: { description: 'Consumer list', content: { 'application/json': { schema: z.object({ consumers: z.array(z.object({}).passthrough()) }) } } } },
}), (c) => c.json({} as never))

// --- Knowledge ---

docs.openapi(createRoute({
  method: 'get', path: '/api/workspaces/{id}/knowledge', tags: tag('Knowledge'),
  summary: 'List knowledge sources and gaps for a workspace',
  request: { params: z.object({ id: z.string().openapi({ param: { name: 'id', in: 'path' } }) }) },
  responses: { 200: { description: 'Knowledge sources and gaps', content: { 'application/json': { schema: z.object({ knowledge: z.array(z.object({}).passthrough()), gaps: z.array(z.object({}).passthrough()) }) } } } },
}), (c) => c.json({} as never))

// --- Compliance ---

docs.openapi(createRoute({
  method: 'get', path: '/api/workspaces/{id}/compliance', tags: tag('Compliance'),
  summary: 'List guardrails and violations for a workspace',
  request: { params: z.object({ id: z.string().openapi({ param: { name: 'id', in: 'path' } }) }) },
  responses: { 200: { description: 'Guardrails and violations', content: { 'application/json': { schema: z.object({ guardrails: z.array(z.object({}).passthrough()), violations: z.array(z.object({}).passthrough()) }) } } } },
}), (c) => c.json({} as never))

// --- Conversations ---

docs.openapi(createRoute({
  method: 'get', path: '/api/workspaces/{id}/conversations', tags: tag('Conversations'),
  summary: 'List conversations with filtering and pagination',
  request: {
    params: z.object({ id: z.string().openapi({ param: { name: 'id', in: 'path' } }) }),
    query: z.object({
      status: z.string().optional().openapi({ param: { name: 'status', in: 'query' } }),
      category: z.string().optional().openapi({ param: { name: 'category', in: 'query' } }),
      resolution: z.string().optional().openapi({ param: { name: 'resolution', in: 'query' } }),
      consumer: z.string().optional().openapi({ param: { name: 'consumer', in: 'query' } }),
      limit: z.string().optional().openapi({ param: { name: 'limit', in: 'query' } }),
      offset: z.string().optional().openapi({ param: { name: 'offset', in: 'query' } }),
    }),
  },
  responses: { 200: { description: 'Conversations with stats', content: { 'application/json': { schema: ConversationsListResponse } } } },
}), (c) => c.json({} as never))

docs.openapi(createRoute({
  method: 'get', path: '/api/workspaces/{id}/conversations/{cid}', tags: tag('Conversations'),
  summary: 'Get conversation detail with messages and stats',
  request: { params: z.object({
    id: z.string().openapi({ param: { name: 'id', in: 'path' } }),
    cid: z.string().openapi({ param: { name: 'cid', in: 'path' } }),
  }) },
  responses: { 200: { description: 'Conversation detail', content: { 'application/json': { schema: ConversationDetailResponse } } } },
}), (c) => c.json({} as never))

docs.openapi(createRoute({
  method: 'post', path: '/api/workspaces/{id}/conversations/{cid}/close', tags: tag('Conversations'),
  summary: 'Close a conversation and trigger analysis',
  request: { params: z.object({
    id: z.string().openapi({ param: { name: 'id', in: 'path' } }),
    cid: z.string().openapi({ param: { name: 'cid', in: 'path' } }),
  }) },
  responses: { 200: { description: 'Closed', content: { 'application/json': { schema: z.object({ status: z.literal('closed'), message: z.string() }) } } } },
}), (c) => c.json({} as never))

// --- Connectors ---

docs.openapi(createRoute({
  method: 'post', path: '/api/connectors/mcp/test', tags: tag('Connectors'),
  summary: 'Test an MCP connection (discover tools without saving)',
  request: { body: { content: { 'application/json': { schema: McpTestBody } } } },
  responses: { 200: { description: 'Test result', content: { 'application/json': { schema: McpTestResponse } } } },
}), (c) => c.json({} as never))

docs.openapi(createRoute({
  method: 'post', path: '/api/connectors/mcp', tags: tag('Connectors'),
  summary: 'Save an MCP connection and discover tools',
  request: { body: { content: { 'application/json': { schema: McpSaveBody } } } },
  responses: {
    200: { description: 'Saved', content: { 'application/json': { schema: z.object({ status: z.literal('saved'), message: z.string(), tools: z.number() }) } } },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorResponse } } },
  },
}), (c) => c.json({} as never))


// --- Query ---

docs.openapi(createRoute({
  method: 'post', path: '/api/workspaces/{id}/query', tags: tag('Query'),
  summary: 'Send a query to a workspace agent (AI + MCP tools)',
  description: 'The core endpoint. Sends a natural language query to the workspace agent, which orchestrates the AI model and any connected MCP tools to produce a response.',
  request: {
    params: z.object({ id: z.string().openapi({ param: { name: 'id', in: 'path' } }) }),
    body: { content: { 'application/json': { schema: QueryBody } } },
  },
  responses: {
    200: { description: 'Agent response', content: { 'application/json': { schema: QueryResponse } } },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorResponse } } },
  },
}), (c) => c.json({} as never))

// ── OpenAPI document config ───────────────────────────────────────

docs.doc('/api/openapi.json', {
  openapi: '3.1.0',
  info: {
    title: 'SupaProxy API',
    version: '0.1.0',
    description: 'AI operations engine. Route any LLM to any team through one governed layer.',
    license: { name: 'MIT', url: 'https://github.com/NumstackPtyLtd/supaproxy-core/blob/main/LICENSE' },
  },
  servers: [{ url: 'http://localhost:3001', description: 'Local development' }],
  tags: [
    { name: 'System', description: 'Health checks and configuration' },
    { name: 'Auth', description: 'Authentication and session management' },
    { name: 'Organisation', description: 'Organisation settings, users, and integrations' },
    { name: 'Queues', description: 'BullMQ job queue management' },
    { name: 'Workspaces', description: 'Workspace CRUD, dashboard, and activity' },
    { name: 'Connections', description: 'MCP and external connections' },
    { name: 'Consumers', description: 'Message consumer bindings' },
    { name: 'Knowledge', description: 'Knowledge sources and gap detection' },
    { name: 'Compliance', description: 'Guardrails and violation tracking' },
    { name: 'Conversations', description: 'Conversation lifecycle, messages, and analytics' },
    { name: 'Connectors', description: 'Connect MCP servers and consumer channels' },
    { name: 'Query', description: 'Send queries to workspace agents' },
  ],
  security: [],
})

// Serve bundled Redoc JS
docs.get('/public/redoc.standalone.js', async (c) => {
  const fs = await import('fs/promises')
  const path = await import('path')
  const filePath = path.resolve(import.meta.dirname, '../public/redoc.standalone.js')
  const js = await fs.readFile(filePath, 'utf-8')
  return c.body(js, 200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'public, max-age=86400' })
})

// Redoc UI
docs.get('/docs', (c) => {
  return c.html(html`<!DOCTYPE html>
<html>
<head>
  <title>SupaProxy API</title>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>body { margin: 0; padding: 0; }</style>
</head>
<body>
  <div style="padding: 12px 24px; background: #f8f9fa; border-bottom: 1px solid #e0e0e0; display: flex; align-items: center; gap: 16px;">
    <strong>SupaProxy API</strong>
    <a href="/api/openapi.json" download="supaproxy-openapi.json" style="color: #0066cc; text-decoration: none; font-size: 14px;">Download OpenAPI spec (Postman, Insomnia, etc.)</a>
  </div>
  <redoc spec-url='/api/openapi.json'></redoc>
  <script src="/public/redoc.standalone.js"></script>
</body>
</html>`)
})

export default docs
