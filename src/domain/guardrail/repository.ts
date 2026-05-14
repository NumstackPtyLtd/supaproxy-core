export type GuardrailEventType = 'execution_blocked' | 'retrieval_stripped'

export type DisplayFormat = 'text' | 'code' | 'pre' | 'danger' | 'warning' | 'badge'

export interface DisplayField {
  source: 'context' | 'outcome'
  key: string
  label: string
  format: DisplayFormat
}

export type EventActionType = 'flag' | 'dismiss' | 'block_connection'

export interface EventAction {
  type: EventActionType
  label: string
}

export type EventStatus = 'open' | 'flagged' | 'dismissed'

export interface GuardrailEventData {
  id: string
  workspace_id: string
  conversation_id: string | null
  event_type: GuardrailEventType
  plugin_id: string
  context: Record<string, unknown>
  outcome: Record<string, unknown>
  display: DisplayField[]
  actions: EventAction[]
  status: EventStatus
  created_at?: string
}

export interface GuardrailEventFilter {
  event_type?: GuardrailEventType
  status?: EventStatus
  search?: string
  limit?: number
  offset?: number
}

export interface GuardrailEventRepository {
  create(data: GuardrailEventData): Promise<void>
  findByWorkspace(workspaceId: string, limit?: number): Promise<GuardrailEventData[]>
  findByWorkspaceFiltered(workspaceId: string, filter: GuardrailEventFilter): Promise<{ events: GuardrailEventData[]; total: number }>
  updateStatus(id: string, status: EventStatus): Promise<void>
}
