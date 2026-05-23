import type { WorkspaceRepository } from '../../domain/workspace/repository.js'
import type { IndexKnowledgeForWorkspaceUseCase } from '../knowledge/IndexKnowledgeForWorkspaceUseCase.js'
import { generateId } from '../../domain/shared/EntityId.js'
import pino from 'pino'

const log = pino({ name: 'create-knowledge-source' })

interface CreateInput {
  workspaceId: string
  name: string
  type: 'inline' | 'url' | 'confluence' | 'file'
  content: string
}

export class CreateKnowledgeSourceUseCase {
  constructor(
    private readonly workspaceRepo: WorkspaceRepository,
    private readonly indexKnowledge?: IndexKnowledgeForWorkspaceUseCase,
  ) {}

  async execute(input: CreateInput): Promise<{ id: string; chunksIndexed: number }> {
    const sourceId = generateId()

    await this.workspaceRepo.createKnowledgeSource(sourceId, input.workspaceId, input.type, input.name, JSON.stringify({ content: input.content }))

    let chunksIndexed = 0
    if (this.indexKnowledge) {
      try {
        const result = await this.indexKnowledge.execute({ sourceId, workspaceId: input.workspaceId, type: input.type, name: input.name, content: input.content })
        chunksIndexed = result.chunksIndexed
        await this.workspaceRepo.updateKnowledgeSourceStatus(sourceId, 'synced', chunksIndexed)
      } catch (err) {
        log.warn({ err, sourceId }, 'Knowledge indexing failed')
        await this.workspaceRepo.updateKnowledgeSourceStatus(sourceId, 'error', 0)
      }
    }

    return { id: sourceId, chunksIndexed }
  }
}
