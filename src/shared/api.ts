/**
 * API response types: typed contracts between server and clients.
 * Every endpoint has a corresponding response type here.
 */

import type {
  Conversation, ConversationWithStats, ConversationStats, Message, AuditLog,
  Workspace, Connection, ConnectionTool, Consumer, KnowledgeSourceEntity, Guardrail,
  Organisation, User, ComplianceViolation, KnowledgeGap, FraudIndicator,
} from './entities';

// ── Health ──

export interface HealthResponse {
  status: 'ok';
  setup_complete: boolean;
  workspaces: number;
  ai_configured: boolean;
  connections: number;
}

// ── Auth ──

export interface SessionResponse {
  user: { id: string; email: string; name: string; role: string } | null;
}

export interface SignupRequest {
  org_name: string;
  admin_name: string;
  admin_email: string;
  admin_password: string;
  workspace_name: string;
  team_name: string;
  system_prompt?: string;
}

export interface SignupResponse {
  status: 'ok';
  org_id: string;
  user_id: string;
  workspace_id: string;
}

// ── Organisation ──

export interface OrgResponse {
  org: Organisation;
}

export interface OrgSettingsResponse {
  settings: Record<string, string>;
  configured: Record<string, boolean>;
}

export interface OrgUsersResponse {
  users: User[];
}

// ── Models ──

export interface ModelOption {
  id: string;
  label: string;
  default?: boolean;
}

export interface ModelsResponse {
  models: ModelOption[];
}

// ── Workspaces ──

export interface WorkspaceListItem extends Workspace {
  connection_count: number;
  tool_count: number;
  knowledge_count: number;
  queries_today: number;
  cost_mtd: number;
}

export interface WorkspaceListResponse {
  workspaces: WorkspaceListItem[];
}

export interface WorkspaceSummaryResponse {
  workspace: Workspace & { team: string };
}

export interface WorkspaceDetailResponse {
  workspace: Workspace;
  connections: Connection[];
  tools: ConnectionTool[];
  knowledge: KnowledgeSourceEntity[];
  guardrails: Guardrail[];
  consumers: Consumer[];
  permissions: Array<{ role: string; tool_patterns: string }>;
  stats: {
    today: number;
    week: number;
    month: number;
    avg_ms: number;
    cost_mtd: number;
    error_rate: number;
  };
}

// ── Connections ──

export interface ConnectionsResponse {
  connections: Connection[];
  tools: ConnectionTool[];
}

export interface McpTestResponse {
  ok: boolean;
  tools?: number;
  server?: string;
  toolNames?: string[];
  error?: string;
}

export interface SaveConnectionResponse {
  status: 'saved';
  message: string;
  tools?: number;
}

// ── Consumers ──

export interface ConsumersResponse {
  consumers: Consumer[];
}

// ── Knowledge ──

export interface KnowledgeResponse {
  knowledge: KnowledgeSourceEntity[];
  gaps: Array<KnowledgeGap & { conversation_id: string; user_name: string; timestamp: string }>;
}

// ── Compliance ──

export interface ComplianceResponse {
  guardrails: Guardrail[];
  violations: Array<ComplianceViolation & { conversation_id: string; user_name: string; timestamp: string }>;
}

// ── Conversations ──

export interface ConversationFilters {
  status: string[];
  consumer: string[];
  category: string[];
  resolution: string[];
}

export interface ConversationListResponse {
  conversations: ConversationWithStats[];
  total: number;
  filters: ConversationFilters;
}

export interface ConversationDetailResponse {
  conversation: Conversation;
  messages: Array<Message & {
    tools_called: string | null;
    connections_hit: string | null;
    tokens_input: number | null;
    tokens_output: number | null;
    cost_usd: number | null;
    duration_ms: number | null;
    query_error: string | null;
  }>;
  stats: ConversationStats | null;
}

export interface CloseConversationResponse {
  status: 'closed';
  message: string;
}

// ── Dashboard ──

export interface DashboardResponse {
  tickets: { open: number; cold: number; closed_today: number; closed_week: number };
  sentiment: { average: number; distribution: Record<string, number> };
  compliance: { total_violations: number; recent: ComplianceViolation[]; by_rule: Record<string, number> };
  knowledge_gaps: { topics: Array<{ topic: string; count: number; last_seen: string }> };
  resolution: Record<string, number>;
  cost: { today: number; this_week: number; this_month: number };
  usage: { queries_today: number; queries_this_week: number; queries_this_month: number };
  recent_conversations: ConversationWithStats[];
  categories: Record<string, number>;
  channels: Record<string, number>;
}

// ── Query ──

export interface QueryRequest {
  query: string;
  session_id?: string;
}

export interface QueryResponse {
  answer: string;
  tools_called: string[];
  connections_hit: string[];
  tokens: { input: number; output: number };
  cost_usd: number;
  duration_ms: number;
  error: string | null;
  conversation_id: string;
  session_id: string;
}

// ── Queues ──

export interface QueueStats {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

export interface QueuesResponse {
  queues: QueueStats[];
}

// ── Generic ──

export interface ErrorResponse {
  error: string;
}

export interface StatusResponse {
  status: 'ok';
  message?: string;
}
