/**
 * Database entity types: mirrors the MySQL schema.
 * Used by server for type-safe DB queries and by SDK for response typing.
 */

// ── Conversation lifecycle ──

export { ConversationStatus } from '../domain/conversation/ConversationStatus.js';
export type ConsumerType = string;
export type ResolutionStatus = 'resolved' | 'unresolved' | 'escalated' | 'abandoned';
export type ConversationCategory = 'query' | 'issue' | 'sales' | 'feedback' | 'support' | 'internal' | 'other';
export { StatsStatus } from '../domain/conversation/StatsStatus.js';

export interface Conversation {
  id: string;
  workspace_id: string;
  consumer_type: ConsumerType;
  external_thread_id: string | null;
  status: ConversationStatus;
  user_id: string | null;
  user_name: string | null;
  channel: string | null;
  message_count: number;
  first_message_at: string | null;
  last_activity_at: string | null;
  cold_at: string | null;
  closed_at: string | null;
  routed_from: string | null;
  routed_to: string | null;
  route_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  seq: number;
  role: 'user' | 'assistant';
  content: string;
  audit_log_id: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  workspace_id: string;
  conversation_id: string | null;
  consumer_type: ConsumerType | null;
  channel: string | null;
  user_id: string | null;
  user_name: string | null;
  query: string;
  tools_called: string[] | null;
  connections_hit: string[] | null;
  knowledge_chunks_used: number;
  tokens_input: number;
  tokens_output: number;
  cost_usd: number;
  duration_ms: number;
  error: string | null;
  input_screening_action: string | null;
  input_screening_categories: string[] | null;
  input_screening_ms: number | null;
  created_at: string;
}

// ── Analysis ──

export interface ComplianceViolation {
  rule: string;
  description: string;
}

export interface KnowledgeGap {
  topic: string;
  description: string;
}

export interface FraudIndicator {
  type: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
}

export interface ConversationStats {
  id: string;
  conversation_id: string;
  sentiment_score: number | null;
  resolution_status: ResolutionStatus | null;
  category: ConversationCategory | null;
  summary: string | null;
  compliance_violations: ComplianceViolation[];
  knowledge_gaps: KnowledgeGap[];
  fraud_indicators: FraudIndicator[];
  tools_used: string[];
  total_tokens_input: number;
  total_tokens_output: number;
  total_cost_usd: number;
  message_count: number;
  duration_seconds: number;
  stats_status: StatsStatus;
  created_at: string;
}

// Conversation with stats joined (returned by list endpoint)
export interface ConversationWithStats extends Conversation {
  sentiment_score: number | null;
  resolution_status: ResolutionStatus | null;
  category: ConversationCategory | null;
  summary: string | null;
  total_cost_usd: number | null;
  compliance_violations: string | null; // JSON string from DB
  knowledge_gaps: string | null;
  fraud_indicators: string | null;
  tools_used: string | null;
  stats_message_count: number | null;
  duration_seconds: number | null;
  stats_status: StatsStatus | null;
}

// ── Workspace ──

export { WorkspaceStatus } from '../domain/workspace/WorkspaceStatus.js';
export type ConnectionStatus = 'connected' | 'disconnected' | 'error';
export type ConnectionTransport = 'http' | 'stdio';

export interface Workspace {
  id: string;
  org_id: string;
  team_id: string;
  name: string;
  status: WorkspaceStatus;
  model: string;
  system_prompt: string | null;
  max_tool_rounds: number;
  cold_timeout_minutes: number;
  close_timeout_minutes: number;
  is_default: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  team?: string;
}

export interface Connection {
  id: string;
  workspace_id: string;
  name: string;
  type: 'mcp' | 'rest' | 'graphql' | 'database';
  status: ConnectionStatus;
  config: string; // JSON
}

export interface ConnectionTool {
  id: string;
  connection_id: string;
  name: string;
  description: string;
  input_schema: string; // JSON
  is_write: boolean;
  // Joined
  connection_name?: string;
  connection_type?: string;
}

export interface Consumer {
  id: string;
  workspace_id: string;
  type: ConsumerType;
  config: string; // JSON
  status: 'active' | 'inactive';
}

export interface KnowledgeSourceEntity {
  id: string;
  workspace_id: string;
  type: 'confluence' | 'file' | 'inline' | 'url';
  name: string;
  config: string; // JSON
  status: 'pending' | 'syncing' | 'synced' | 'error';
  chunks: number;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Guardrail {
  id: string;
  workspace_id: string;
  rule_type: string;
  enabled: boolean;
  config: string; // JSON
  created_at: string;
  updated_at: string;
}

// ── Organisation ──

export interface Organisation {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface User {
  id: string;
  org_id: string;
  email: string;
  name: string;
  org_role: 'admin' | 'member';
  created_at: string;
}

export interface OrgSetting {
  key_name: string;
  value: string;
  is_secret: boolean;
}

// ── Guardrail policies ──

export type PolicyEnforcement = 'mandatory' | 'recommended' | 'off';

export interface GuardrailPolicy {
  id: string;
  org_id: string;
  plugin_id: string;
  enforcement: PolicyEnforcement;
  created_at: string;
  updated_at: string;
}

export interface GuardrailPolicyOverride {
  id: string;
  policy_id: string;
  workspace_id: string;
  justification: string;
  created_by: string;
  created_at: string;
}
