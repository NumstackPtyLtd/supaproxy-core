import { WorkspaceStatus } from './WorkspaceStatus.js'

export interface WorkspaceData {
  id: string
  org_id: string | null
  team_id: string | null
  name: string
  status: WorkspaceStatus
  model: string
  provider_type: string | null
  system_prompt: string | null
  max_tool_rounds: number
  max_thread_history: number
  cold_timeout_minutes: number | null
  close_timeout_minutes: number | null
  is_default: boolean
  created_by: string | null
  created_at: string
  updated_at: string
  team?: string | null
}

export interface WorkspaceRoutingSummary {
  id: string
  name: string
  system_prompt: string | null
  tool_names: string[]
}

export interface ConnectionData {
  id: string
  workspace_id: string
  name: string
  type: string
  status: string
  config: string
}

export interface ConnectionToolData {
  id: string
  connection_id: string
  name: string
  description: string | null
  input_schema: string | null
  is_write: boolean
  connection_name?: string
  connection_type?: string
}

export interface ConsumerData {
  id: string
  workspace_id: string
  type: string
  config: string
  status: string
}

export interface KnowledgeSourceData {
  id: string
  type: string
  name: string
  config: string
  status: string
  chunks: number
  last_synced_at: string | null
}

export interface GuardrailData {
  id: string
  rule_type: string
  enabled: boolean
  config: string
}

export interface PermissionData {
  role: string
  tool_patterns: string | null
}

export interface WorkspaceStatsData {
  today: number
  week: number
  month: number
  avg_ms: number
  cost_mtd: number
  errors_week: number
  total_week: number
}

export interface WorkspaceListItemData {
  id: string
  name: string
  team: string | null
  status: string
  model: string
  created_at: string
  connection_count: number
  tool_count: number
  knowledge_count: number
  queries_today: number
  cost_mtd: number
}

export interface OrgConnectionData {
  id: string
  workspace_id: string
  workspace_name: string
  name: string
  type: string
  status: string
  tool_count: number
}

export interface OrgToolData {
  id: string
  connection_id: string
  connection_name: string
  name: string
  description: string | null
  is_write: boolean
  workspace_id: string
  workspace_name: string
}

export interface OrgConnectionsResult {
  connections: OrgConnectionData[]
  tools: OrgToolData[]
  total: number
}

export interface ActivityLogData {
  id: string
  consumer_type: string | null
  channel: string | null
  user_name: string | null
  query: string
  tools_called: string | null
  connections_hit: string | null
  tokens_input: number
  tokens_output: number
  cost_usd: number
  duration_ms: number
  error: string | null
  created_at: string
}

export interface WorkspaceRepository {
  findById(id: string): Promise<WorkspaceData | null>
  findByIdWithTeam(id: string): Promise<WorkspaceData | null>
  findActiveById(id: string): Promise<WorkspaceData | null>
  existsById(id: string): Promise<boolean>
  create(workspace: { id: string; orgId: string | null; teamId: string | null; name: string; model: string; systemPrompt: string; createdBy?: string | null }): Promise<void>
  update(id: string, fields: { name?: string; model?: string; provider_type?: string | null; system_prompt?: string; cold_timeout_minutes?: number | null; close_timeout_minutes?: number | null }): Promise<void>
  listNonArchived(orgId: string | null): Promise<WorkspaceListItemData[]>
  getSummary(id: string): Promise<WorkspaceData | null>

  listOrgConnections(orgId: string, options: { search?: string; limit: number; offset: number }): Promise<OrgConnectionsResult>
  findConnections(workspaceId: string): Promise<ConnectionData[]>
  findConnectionConfigs(workspaceId: string): Promise<Array<{ name: string; type: string; config: string }>>
  findConnectionByName(workspaceId: string, name: string): Promise<ConnectionData | null>
  createConnection(id: string, workspaceId: string, name: string, type: string, config: string): Promise<void>
  updateConnectionConfig(id: string, config: string): Promise<void>
  updateConnectionStatus(id: string, status: string): Promise<void>
  deleteConnection(id: string): Promise<void>

  findTools(workspaceId: string): Promise<ConnectionToolData[]>
  findToolsDetailed(workspaceId: string): Promise<ConnectionToolData[]>
  deleteToolsByConnection(connectionId: string): Promise<void>
  createTools(tools: Array<{ id: string; connectionId: string; name: string; description: string; inputSchema: string; isWrite: boolean }>): Promise<void>

  findConsumers(workspaceId: string): Promise<ConsumerData[]>
  findConsumerByType(workspaceId: string, type: string): Promise<ConsumerData | null>
  createConsumer(id: string, workspaceId: string, type: string, config: string): Promise<void>
  updateConsumerConfig(id: string, config: string): Promise<void>
  findConsumerBoundToChannel(type: string, excludeWorkspaceId: string, channelId: string): Promise<{ workspace_id: string; workspace_name: string } | null>
  findConsumersByType(type: string): Promise<Array<{ workspace_id: string; config: string; model: string; system_prompt: string | null; max_tool_rounds: number }>>

  findKnowledge(workspaceId: string): Promise<KnowledgeSourceData[]>
  createKnowledgeSource(id: string, workspaceId: string, type: string, name: string, config: string): Promise<void>
  updateKnowledgeSourceStatus(id: string, status: string, chunks: number): Promise<void>
  deleteKnowledgeSource(id: string): Promise<void>
  findGuardrails(workspaceId: string): Promise<GuardrailData[]>
  findEnabledGuardrailConfigs(workspaceId: string): Promise<Array<{ guardrail_id: string; config: string | null }>>
  enableGuardrail(id: string, workspaceId: string, guardrailId: string, config?: string): Promise<void>
  disableGuardrail(workspaceId: string, guardrailId: string): Promise<void>
  findPermissions(workspaceId: string): Promise<PermissionData[]>
  getStats(workspaceId: string): Promise<WorkspaceStatsData>

  getActiveWorkspaceCount(): Promise<number>
  getConnectedConnectionCount(): Promise<number>
  getActiveConsumerCount(): Promise<number>
  getFirstActiveWorkspace(): Promise<WorkspaceData | null>

  findActivityLog(workspaceId: string, limit: number, offset: number): Promise<{ rows: ActivityLogData[]; total: number }>

  findDefaultByOrg(orgId: string): Promise<WorkspaceData | null>
  listRoutingSummaries(orgId: string): Promise<WorkspaceRoutingSummary[]>
  setDefault(id: string): Promise<void>
  unsetDefault(id: string): Promise<void>
  deleteWorkspace(id: string): Promise<void>
}
