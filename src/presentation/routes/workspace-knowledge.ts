import { Hono } from 'hono'
import { z } from 'zod'
import type { GetKnowledgeUseCase } from '../../application/workspace/GetKnowledgeUseCase.js'
import type { CreateKnowledgeSourceUseCase } from '../../application/workspace/CreateKnowledgeSourceUseCase.js'
import type { DeleteKnowledgeSourceUseCase } from '../../application/workspace/DeleteKnowledgeSourceUseCase.js'
import { parseBody } from '../middleware/validate.js'
import { type AuthUser, type AuthEnv } from '../middleware/auth.js'
import type { GuardFn } from '../helpers/guardWorkspace.js'

const createKnowledgeSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(['inline', 'url', 'confluence', 'file']),
  content: z.string().min(1),
})

interface WorkspaceKnowledgeRouteDeps {
  getKnowledgeUseCase: GetKnowledgeUseCase
  createKnowledgeSourceUseCase: CreateKnowledgeSourceUseCase
  deleteKnowledgeSourceUseCase: DeleteKnowledgeSourceUseCase
  requireAuth: (c: import('hono').Context, next: import('hono').Next) => Promise<Response | void>
}

function listKnowledge(deps: WorkspaceKnowledgeRouteDeps, guard: GuardFn) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const user = c.get('user') as AuthUser
    await guard(c.req.param('id')!, user.org_id)
    const result = await deps.getKnowledgeUseCase.execute(c.req.param('id')!)
    return c.json(result)
  }
}

function createKnowledgeSource(deps: WorkspaceKnowledgeRouteDeps, guard: GuardFn) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const user = c.get('user') as AuthUser
    const workspaceId = c.req.param('id')!
    await guard(workspaceId, user.org_id)

    const parsed = await parseBody(c, createKnowledgeSchema)
    if (!parsed.success) return parsed.response

    const result = await deps.createKnowledgeSourceUseCase.execute({
      workspaceId,
      name: parsed.data.name,
      type: parsed.data.type,
      content: parsed.data.content,
    })

    return c.json(result, 201)
  }
}

function deleteKnowledgeSource(deps: WorkspaceKnowledgeRouteDeps, guard: GuardFn) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const user = c.get('user') as AuthUser
    await guard(c.req.param('id')!, user.org_id)
    await deps.deleteKnowledgeSourceUseCase.execute(c.req.param('sourceId')!)
    return c.json({ deleted: true })
  }
}

export function createWorkspaceKnowledgeRoutes(deps: WorkspaceKnowledgeRouteDeps, guardWorkspace: GuardFn) {
  const app = new Hono<AuthEnv>()

  app.get('/api/workspaces/:id/knowledge', listKnowledge(deps, guardWorkspace))
  app.post('/api/workspaces/:id/knowledge', createKnowledgeSource(deps, guardWorkspace))
  app.delete('/api/workspaces/:id/knowledge/:sourceId', deleteKnowledgeSource(deps, guardWorkspace))

  return app
}
