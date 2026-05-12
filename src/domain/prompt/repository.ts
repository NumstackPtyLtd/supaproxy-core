export type PromptType =
  | 'receptionist'
  | 'scope_enforcement'
  | 'out_of_scope_message'
  | 'cold_message'
  | 'analysis'
  | 'agent_intro'
  | 'system_prompt'

export type PromptScope = 'system' | 'org' | 'workspace'

export interface PromptTemplateData {
  id: string
  prompt_type: PromptType
  scope: PromptScope
  scope_id: string | null
  content: string
  version: number
  is_active: boolean
  is_draft: boolean
  created_by: string | null
  created_at: string
}

export interface PromptTemplateRepository {
  findActive(promptType: PromptType, scope: PromptScope, scopeId: string | null): Promise<PromptTemplateData | null>
  findAllActive(scope: PromptScope, scopeId: string | null): Promise<PromptTemplateData[]>
  findVersions(promptType: PromptType, scope: PromptScope, scopeId: string | null): Promise<PromptTemplateData[]>
  create(data: {
    id: string
    promptType: PromptType
    scope: PromptScope
    scopeId: string | null
    content: string
    version: number
    isDraft: boolean
    createdBy: string | null
  }): Promise<void>
  activate(id: string): Promise<void>
  deactivateAllForType(promptType: PromptType, scope: PromptScope, scopeId: string | null): Promise<void>
}
