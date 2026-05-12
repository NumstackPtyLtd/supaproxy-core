// SupaProxy shared types: used by server, web, and SDK

export interface WorkspaceConfig {
  workspace: {
    id: string
    name: string
    team: string
    created: string
    status: 'active' | 'paused' | 'archived'

    mcp_servers: McpServerConfig[]
    knowledge: KnowledgeConfig
    consumers: ConsumerConfig
    permissions: PermissionsConfig
    guardrails: GuardrailsConfig
    system_prompt: string
    model: string
    max_tool_rounds: number
    max_thread_history: number
  }
}

export interface McpServerConfig {
  name: string
  transport: 'stdio' | 'http'
  // stdio
  command?: string
  args?: string[]
  cwd?: string
  env?: Record<string, string>
  // http
  url?: string
  auth?: 'keycloak' | 'bearer' | 'none'
}

export interface KnowledgeConfig {
  sources: KnowledgeSource[]
}

export type KnowledgeSource =
  | { type: 'confluence'; space: string; pages?: string[] }
  | { type: 'file'; paths: string[] }
  | { type: 'inline'; content: string }

/** Per-consumer-type configuration. Keys are consumer type names. */
export type ConsumerConfig = Record<string, ConsumerTypeConfig>

export interface ConsumerTypeConfig {
  channels?: string[]
  allow_dms?: boolean
  thread_context?: boolean
  endpoint?: string
  api_keys?: string[]
  [key: string]: unknown
}

export interface PermissionsConfig {
  roles: RolePermission[]
}

export interface RolePermission {
  role: string
  tools: string[] // glob patterns: "get-*", "*", etc.
}

export interface GuardrailsConfig {
  pii_filter: boolean
  pii_fields?: string[]
  write_confirmation: boolean
  write_tool_patterns?: string[]
  cost_cap_monthly_usd: number
  rate_limit: {
    per_user_per_minute: number
    per_workspace_per_hour: number
  }
  blocked_topics?: string[]
}

// Permission model (inspired by cash-management-frontend)
export enum Permission {
  // Workspace
  ViewWorkspaces = 'ViewWorkspaces',
  CreateWorkspace = 'CreateWorkspace',
  UpdateWorkspace = 'UpdateWorkspace',
  DeleteWorkspace = 'DeleteWorkspace',

  // Tools
  UseReadTools = 'UseReadTools',
  UseWriteTools = 'UseWriteTools',
  UseAllTools = 'UseAllTools',

  // Knowledge
  ViewKnowledge = 'ViewKnowledge',
  ManageKnowledge = 'ManageKnowledge',

  // Dashboard
  ViewDashboard = 'ViewDashboard',
  ViewAllWorkspaceStats = 'ViewAllWorkspaceStats',

  // Admin
  ManageUsers = 'ManageUsers',
  ManageGuardrails = 'ManageGuardrails',
  ViewAuditLogs = 'ViewAuditLogs',
}

export interface HasPermissionProps {
  anyOf?: Permission[]
  allOf?: Permission[]
}

export function hasPermission(
  userPermissions: string[],
  props?: HasPermissionProps,
): boolean {
  if (!props) return true
  const { anyOf, allOf } = props
  if (anyOf?.length) return anyOf.some((p) => userPermissions.includes(p))
  if (allOf?.length) return allOf.every((p) => userPermissions.includes(p))
  return true
}

// Audit log entry
export interface AuditEntry {
  timestamp: string
  workspace_id: string
  consumer: string
  channel?: string
  user_id: string
  user_name?: string
  query: string
  tools_called: {
    name: string
    args: Record<string, unknown>
    duration_ms: number
  }[]
  knowledge_chunks_used: number
  tokens: { input: number; output: number }
  cost_usd: number
  guardrails: {
    pii_filtered: boolean
    write_confirmed: boolean
    rate_limited: boolean
  }
  response_length: number
  error: string | null
}

// User session (from Azure AD via Auth.js)
export interface SupaproxyUser {
  id: string
  name: string
  email: string
  image?: string | null
  permissions: Permission[]
  workspaces: string[] // workspace IDs this user can access
}
