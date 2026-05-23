import { z } from 'zod'
import { MAX_WORKSPACE_NAME_LENGTH, MAX_TIMEOUT_MINUTES, MAX_SYSTEM_PROMPT_LENGTH } from '../../defaults.js'

export const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(MAX_WORKSPACE_NAME_LENGTH),
  model: z.string().min(1).max(100),
  team_id: z.string().max(MAX_WORKSPACE_NAME_LENGTH).optional(),
  team_name: z.string().max(MAX_WORKSPACE_NAME_LENGTH).optional(),
  system_prompt: z.string().max(MAX_SYSTEM_PROMPT_LENGTH).optional(),
  org_id: z.string().max(MAX_WORKSPACE_NAME_LENGTH).optional(),
}).refine((data) => data.team_id || data.team_name, {
  path: ['team_id'],
})

export const updateWorkspaceSchema = z.object({
  name: z.string().min(1).max(MAX_WORKSPACE_NAME_LENGTH).optional(),
  model: z.string().min(1).max(MAX_WORKSPACE_NAME_LENGTH).optional(),
  provider_type: z.string().min(1).max(50).nullable().optional(),
  system_prompt: z.string().max(MAX_SYSTEM_PROMPT_LENGTH).optional(),
  cold_timeout_minutes: z.number().int().min(1).max(MAX_TIMEOUT_MINUTES).nullable().optional(),
  close_timeout_minutes: z.number().int().min(1).max(MAX_TIMEOUT_MINUTES).nullable().optional(),
})
