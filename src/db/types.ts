import type { RowDataPacket } from 'mysql2'

// ── Core entity row types ──

export interface OrganisationRow extends RowDataPacket {
  id: string
  name: string
  slug: string
  created_at: string
  updated_at: string
}

export interface UserRow extends RowDataPacket {
  id: string
  org_id: string | null
  email: string
  name: string
  password_hash: string
  org_role: 'admin' | 'workspace_admin' | 'user'
  created_at: string
  updated_at: string
}

export interface WorkspaceRow extends RowDataPacket {
  id: string
  org_id: string | null
  team_id: string | null
  name: string
  status: 'active' | 'paused' | 'archived'
  model: string
  provider_type: string | null
  system_prompt: string | null
  max_tool_rounds: number
  max_thread_history: number
  cold_timeout_minutes: number | null
  close_timeout_minutes: number | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface ConnectionRow extends RowDataPacket {
  id: string
  workspace_id: string
  name: string
  type: 'mcp' | 'rest' | 'graphql' | 'database' | 'webhook'
  status: 'connected' | 'disconnected' | 'error' | 'idle'
  config: string
  created_at: string
  updated_at: string
}

export interface ConnectionToolRow extends RowDataPacket {
  id: string
  connection_id: string
  name: string
  description: string | null
  input_schema: string | null
  is_write: boolean
  created_at: string
}

export interface ConsumerRow extends RowDataPacket {
  id: string
  workspace_id: string
  type: string
  config: string
  status: 'active' | 'inactive'
  created_at: string
  updated_at: string
}

export interface ConversationRow extends RowDataPacket {
  id: string
  workspace_id: string
  consumer_type: string
  external_thread_id: string | null
  status: 'open' | 'cold' | 'closed'
  user_id: string | null
  user_name: string | null
  channel: string | null
  message_count: number
  first_message_at: string | null
  last_activity_at: string | null
  cold_at: string | null
  closed_at: string | null
  parent_conversation_id: string | null
  created_at: string
  updated_at: string
}

export interface ConversationMessageRow extends RowDataPacket {
  id: string
  conversation_id: string
  role: 'user' | 'assistant'
  content: string
  audit_log_id: string | null
  seq: number
  created_at: string
}

export interface ConversationStatsRow extends RowDataPacket {
  id: string
  conversation_id: string
  sentiment_score: number | null
  resolution_status: string | null
  compliance_violations: string | null
  knowledge_gaps: string | null
  fraud_indicators: string | null
  tools_used: string | null
  total_tokens_input: number
  total_tokens_output: number
  total_cost_usd: number
  total_duration_ms: number
  message_count: number
  duration_seconds: number
  summary: string | null
  category: string | null
  stats_status: 'pending' | 'complete' | 'failed'
  created_at: string
}

export interface AuditLogRow extends RowDataPacket {
  id: string
  workspace_id: string
  conversation_id: string | null
  consumer_type: string | null
  channel: string | null
  user_id: string | null
  user_name: string | null
  query: string
  tools_called: string | null
  connections_hit: string | null
  knowledge_chunks_used: number
  tokens_input: number
  tokens_output: number
  cost_usd: number
  duration_ms: number
  guardrails_applied: string | null
  error: string | null
  created_at: string
}

export interface OrgSettingRow extends RowDataPacket {
  id: string
  org_id: string
  key_name: string
  value: string
  is_secret: boolean
  created_at: string
  updated_at: string
}

// ── Common query result shapes ──

export interface CountRow extends RowDataPacket {
  c: number
}

export interface TotalRow extends RowDataPacket {
  total: number
}

export interface IdRow extends RowDataPacket {
  id: string
}

export interface ValueRow extends RowDataPacket {
  value: string
}

export interface KeyValueRow extends RowDataPacket {
  key_name: string
  value: string
}

export interface ModelRow extends RowDataPacket {
  id: string
  label: string
  is_default: boolean
}

export interface ColumnInfoRow extends RowDataPacket {
  Field: string
  Type: string
  Null: string
  Key: string
  Default: string | null
  Extra: string
}
