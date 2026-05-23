import { Hono } from 'hono'
import { z } from 'zod'
import type { PromptResolver } from '../../application/prompt/PromptResolver.js'
import type { SavePromptUseCase } from '../../application/prompt/SavePromptUseCase.js'
import type { ListPromptsUseCase } from '../../application/prompt/ListPromptsUseCase.js'
import type { GetPromptVersionsUseCase } from '../../application/prompt/GetPromptVersionsUseCase.js'
import type { ActivatePromptUseCase } from '../../application/prompt/ActivatePromptUseCase.js'
import type { PromptType, PromptScope } from '../../domain/prompt/repository.js'
import { parseBody } from '../middleware/validate.js'
import { type AuthUser, type AuthEnv } from '../middleware/auth.js'
import { handleDomainError } from '../helpers/handleDomainError.js'

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
  savePromptUseCase: SavePromptUseCase
  listPromptsUseCase: ListPromptsUseCase
  getPromptVersionsUseCase: GetPromptVersionsUseCase
  activatePromptUseCase: ActivatePromptUseCase
  requireAuth: (c: import('hono').Context, next: import('hono').Next) => Promise<Response | void>
}

function listPrompts(deps: PromptRouteDeps) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const user = c.get('user') as AuthUser
    const prompts = await deps.listPromptsUseCase.execute(user.org_id)
    return c.json({ prompts })
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

    const versions = await deps.getPromptVersionsUseCase.execute(promptType, scope, scopeId)
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
      return handleDomainError(c, err)
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

    await deps.activatePromptUseCase.execute(promptType, id, scope, scopeId)

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
