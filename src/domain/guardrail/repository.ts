export type GuardrailEventType = 'execution_blocked' | 'retrieval_stripped'

export interface GuardrailEventData {
  id: string
  workspace_id: string
  conversation_id: string | null
  event_type: GuardrailEventType
  plugin_id: string
  tool_name: string | null
  tool_args: string | null
  original_query: string | null
  reason: string | null
  original_content: string | null
  stripped_content: string | null
  created_at?: string
}

export interface GuardrailEventRepository {
  create(data: GuardrailEventData): Promise<void>
  findByWorkspace(workspaceId: string, limit?: number): Promise<GuardrailEventData[]>
}
