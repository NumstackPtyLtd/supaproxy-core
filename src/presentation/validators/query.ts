import { z } from 'zod'
import { MAX_QUERY_LENGTH, MAX_HISTORY_ITEMS } from '../../defaults.js'

export const queryBodySchema = z.object({
  query: z.string().min(1).max(MAX_QUERY_LENGTH),
  session_id: z.string().max(255).optional(),
  consumer_type: z.string().max(50).optional(),
  consumer_context: z.object({
    channel: z.string().max(255).optional(),
    userId: z.string().max(255).optional(),
    userName: z.string().max(255).optional(),
    threadId: z.string().max(255).optional(),
  }).optional(),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).max(MAX_HISTORY_ITEMS).optional(),
})
