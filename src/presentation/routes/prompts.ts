import { Hono } from 'hono'
import { z } from 'zod'
import type { PromptResolver } from '../../application/prompt/PromptResolver.js'
import type { SavePromptUseCase } from '../../application/prompt/SavePromptUseCase.js'
import type { PromptTemplateRepository, PromptType, PromptScope } from '../../domain/prompt/repository.js'
import { parseBody } from '../middleware/validate.js'
import { type AuthUser, type AuthEnv } from '../middleware/auth.js'
import { ValidationError } from '../../domain/shared/errors.js'

const VALID_PROMPT_TYPES: PromptType[] = [
  'receptionist', 'scope_enforcement', 'out_of_scope_message',
  'cold_message', 'analysis', 'agent_intro', 'system_prompt',
]

const savePromptSchema = z.object({
  content: z.string().min(1).max(50000),
  scope: z.enum(['org', 'workspace']),
  scope_id: z.string().max(64).optional(),
  is_draft: z.boolean().optional(),
})

interface PromptRouteDeps {
  promptResolver: PromptResolver
  promptRepo: PromptTemplateRepository
  savePromptUseCase: SavePromptUseCase
  requireAuth: (c: import('hono').Context, next: import('hono').Next) => Promise<Response | void>
}

function listPrompts(deps: PromptRouteDeps) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const user = c.get('user') as AuthUser
    const orgPrompts = await deps.promptRepo.findAllActive('org', user.org_id)
    return c.json({ prompts: orgPrompts })
  }
}

function getPromptVersions(deps: PromptRouteDeps) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const user = c.get('user') as AuthUser
    const promptType = c.req.param('type')! as PromptType
    if (!VALID_PROMPT_TYPES.includes(promptType)) {
      return c.json({ error: 'invalid_prompt_type' }, 400)
    }

    const scope = (c.req.query('scope') || 'org') as PromptScope
    const scopeId = c.req.query('scope_id') || user.org_id

    const versions = await deps.promptRepo.findVersions(promptType, scope, scopeId)
    return c.json({ versions })
  }
}

function savePrompt(deps: PromptRouteDeps) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const user = c.get('user') as AuthUser
    const promptType = c.req.param('type')! as PromptType
    if (!VALID_PROMPT_TYPES.includes(promptType)) {
      return c.json({ error: 'invalid_prompt_type' }, 400)
    }

    const parsed = await parseBody(c, savePromptSchema)
    if (!parsed.success) return parsed.response

    const scope = parsed.data.scope as PromptScope
    const scopeId = parsed.data.scope_id || user.org_id

    try {
      const result = await deps.savePromptUseCase.execute({
        promptType,
        scope,
        scopeId,
        content: parsed.data.content,
        isDraft: parsed.data.is_draft || false,
        createdBy: user.id,
      })

      return c.json({ id: result.id, version: result.version })
    } catch (err) {
      if (err instanceof ValidationError) return c.json({ error: 'validation_failed' }, 400)
      throw err
    }
  }
}

function activatePrompt(deps: PromptRouteDeps) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const promptType = c.req.param('type')! as PromptType
    if (!VALID_PROMPT_TYPES.includes(promptType)) {
      return c.json({ error: 'invalid_prompt_type' }, 400)
    }

    const user = c.get('user') as AuthUser
    const id = c.req.param('id')!
    const scope = (c.req.query('scope') || 'org') as PromptScope
    const scopeId = c.req.query('scope_id') || user.org_id

    await deps.promptRepo.deactivateAllForType(promptType, scope, scopeId)
    await deps.promptRepo.activate(id)

    return c.json({ status: 'activated' })
  }
}

export function createPromptRoutes(deps: PromptRouteDeps) {
  const prompts = new Hono<AuthEnv>()

  prompts.use('/api/prompts/*', deps.requireAuth)

  prompts.get('/api/prompts', listPrompts(deps))
  prompts.get('/api/prompts/:type/versions', getPromptVersions(deps))
  prompts.put('/api/prompts/:type', savePrompt(deps))
  prompts.post('/api/prompts/:type/activate/:id', activatePrompt(deps))

  return prompts
}
