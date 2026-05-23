import { Hono } from 'hono'
import type { AuthEnv } from '../middleware/auth.js'
import {
  type PromptRouteDeps,
  listPrompts, getPromptVersions, savePrompt, activatePrompt,
} from '../controllers/prompts.js'

export type { PromptRouteDeps }

export function createPromptRoutes(deps: PromptRouteDeps) {
  const prompts = new Hono<AuthEnv>()

  prompts.use('/api/prompts/*', deps.requireAuth)

  prompts.get('/api/prompts', listPrompts(deps))
  prompts.get('/api/prompts/:type/versions', getPromptVersions(deps))
  prompts.put('/api/prompts/:type', savePrompt(deps))
  prompts.post('/api/prompts/:type/activate/:id', activatePrompt(deps))

  return prompts
}
