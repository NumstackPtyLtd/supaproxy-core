import { z } from 'zod'
import type { PromptType } from '../../domain/prompt/repository.js'

export const VALID_PROMPT_TYPES: PromptType[] = [
  'receptionist', 'scope_enforcement', 'out_of_scope_message',
  'cold_message', 'analysis', 'agent_intro', 'system_prompt',
]

export const savePromptSchema = z.object({
  content: z.string().min(1).max(50000),
  scope: z.enum(['org', 'workspace']),
  scope_id: z.string().max(64).optional(),
  is_draft: z.boolean().optional(),
})
