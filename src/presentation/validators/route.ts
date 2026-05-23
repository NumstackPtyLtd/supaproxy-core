import { z } from 'zod'
import { MAX_QUERY_LENGTH } from '../../defaults.js'

export const routeBodySchema = z.object({
  query: z.string().min(1).max(MAX_QUERY_LENGTH),
})
