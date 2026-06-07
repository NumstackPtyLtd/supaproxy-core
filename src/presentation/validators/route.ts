import { z } from 'zod'
import { MAX_QUERY_LENGTH } from '../../defaults.js'

export const routeBodySchema = z.object({
  query: z.string().min(1).max(MAX_QUERY_LENGTH),
  // Optional client-generated test session id. A fresh value starts a new
  // routing session and conversation (used by the dashboard test playground
  // so "Clear" gives a clean slate).
  sessionId: z.string().min(1).max(64).optional(),
})
