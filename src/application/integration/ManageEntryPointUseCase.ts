import type { IntegrationRepository, EntryPointRepository } from '../../domain/integration/repository.js'
import { generateId } from '../../domain/shared/EntityId.js'
import { NotFoundError } from '../../domain/shared/errors.js'

interface CreateEntryPointInput {
  channel_id: string
  channel_name?: string
  direct?: boolean
  direct_workspace_id?: string
}

interface UpdateEntryPointInput {
  channel_name?: string
  direct?: boolean
  direct_workspace_id?: string | null
}

interface RoutingResult {
  mode: 'receptionist' | 'direct'
  workspaceId?: string
  orgId?: string
}

export class ManageEntryPointUseCase {
  constructor(
    private readonly integrationRepo: IntegrationRepository,
    private readonly entryPointRepo: EntryPointRepository,
  ) {}

  async listEntryPoints(integrationId: string) {
    return this.entryPointRepo.findByIntegration(integrationId)
  }

  async createEntryPoint(orgId: string, type: string, input: CreateEntryPointInput): Promise<void> {
    const integration = await this.integrationRepo.findByOrgAndType(orgId, type)
    if (!integration) throw new NotFoundError('Integration', type)

    await this.entryPointRepo.create({
      id: generateId(),
      integration_id: integration.id,
      channel_id: input.channel_id,
      channel_name: input.channel_name || null,
      direct: input.direct || false,
      direct_workspace_id: input.direct ? (input.direct_workspace_id || null) : null,
    })
  }

  async updateEntryPoint(id: string, input: UpdateEntryPointInput): Promise<void> {
    const ep = await this.entryPointRepo.findById(id)
    if (!ep) throw new NotFoundError('EntryPoint', id)

    const update: UpdateEntryPointInput = { ...input }

    // Clear direct_workspace_id when switching to non-direct
    if (input.direct === false) {
      update.direct_workspace_id = null
    }

    await this.entryPointRepo.update(id, update)
  }

  async deleteEntryPoint(id: string): Promise<void> {
    const ep = await this.entryPointRepo.findById(id)
    if (!ep) throw new NotFoundError('EntryPoint', id)
    await this.entryPointRepo.delete(id)
  }

  async resolveRouting(type: string, channelId: string): Promise<RoutingResult> {
    const ep = await this.entryPointRepo.findByChannel(type, channelId)

    if (!ep) return { mode: 'receptionist' }

    if (ep.direct && ep.direct_workspace_id) {
      return { mode: 'direct', workspaceId: ep.direct_workspace_id, orgId: ep.org_id }
    }

    return { mode: 'receptionist', orgId: ep.org_id }
  }
}
