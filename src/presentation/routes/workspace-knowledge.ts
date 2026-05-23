import { Hono } from 'hono'
import { z } from 'zod'
import pino from 'pino'
import type { GetKnowledgeUseCase } from '../../application/workspace/GetKnowledgeUseCase.js'
import type { IndexKnowledgeForWorkspaceUseCase } from '../../application/knowledge/IndexKnowledgeForWorkspaceUseCase.js'
import type { WorkspaceRepository } from '../../domain/workspace/repository.js'
import type { TenantService } from '../../application/ports/TenantService.js'
import { parseBody } from '../middleware/validate.js'
import { type AuthUser, type AuthEnv } from '../middleware/auth.js'
import { generateId } from '../../domain/shared/EntityId.js'

const log = pino({ name: 'routes/workspace-knowledge' })

interface WorkspaceKnowledgeRouteDeps {
  getKnowledgeUseCase: GetKnowledgeUseCase
  indexKnowledgeUseCase?: IndexKnowledgeForWorkspaceUseCase
  workspaceRepo: WorkspaceRepository
  tenantService: TenantService
  requireAuth: (c: import('hono').Context, next: import('hono').Next) => Promise<Response | void>
}

type GuardFn = (workspaceId: string, userOrgId: string) => Promise<void>

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

    const parsed = await parseBody(c, z.object({
      name: z.string().min(1).max(255),
      type: z.enum(['inline', 'url', 'confluence', 'file']),
      content: z.string().min(1),
    }))
    if (!parsed.success) return parsed.response

    const { name, type, content } = parsed.data
    const sourceId = generateId()

    await deps.workspaceRepo.createKnowledgeSource(sourceId, workspaceId, type, name, JSON.stringify({ content }))

    let chunksIndexed = 0
    if (deps.indexKnowledgeUseCase) {
      try {
        const result = await deps.indexKnowledgeUseCase.execute({ sourceId, workspaceId, type, name, content })
        chunksIndexed = result.chunksIndexed
        await deps.workspaceRepo.updateKnowledgeSourceStatus(sourceId, 'synced', chunksIndexed)
      } catch (err) {
        log.warn({ err, sourceId }, 'Knowledge indexing failed')
        await deps.workspaceRepo.updateKnowledgeSourceStatus(sourceId, 'error', 0)
      }
    }

    return c.json({ id: sourceId, chunksIndexed }, 201)
  }
}

function deleteKnowledgeSource(deps: WorkspaceKnowledgeRouteDeps, guard: GuardFn) {
  return async (c: import('hono').Context<AuthEnv>) => {
    const user = c.get('user') as AuthUser
    await guard(c.req.param('id')!, user.org_id)
    await deps.workspaceRepo.deleteKnowledgeSource(c.req.param('sourceId')!)
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
