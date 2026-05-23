import { z } from 'zod'

export const createEntryPointSchema = z.object({
  type: z.string().min(1).max(50),
  channel_id: z.string().min(1).max(255),
  channel_name: z.string().max(255).optional(),
  direct: z.boolean().optional(),
  direct_workspace_id: z.string().max(64).optional(),
})

export const updateEntryPointSchema = z.object({
  channel_name: z.string().max(255).optional(),
  direct: z.boolean().optional(),
  direct_workspace_id: z.string().max(64).nullable().optional(),
})
