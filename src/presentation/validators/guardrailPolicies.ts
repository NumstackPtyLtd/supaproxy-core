import { z } from 'zod'

export const setEnforcementSchema = z.object({
  enforcement: z.enum(['mandatory', 'recommended', 'off']),
})

export const createOverrideSchema = z.object({
  workspace_id: z.string().min(1).max(64),
  justification: z.string().min(1).max(2000),
})
