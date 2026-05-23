import { z } from 'zod'

export const createKnowledgeSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(['inline', 'url', 'confluence', 'file']),
  content: z.string().min(1),
})
