import type { OrganisationRepository } from '../../domain/organisation/repository.js'
import type { WorkspaceRepository } from '../../domain/workspace/repository.js'
import { generateId, generateWorkspaceId } from '../../domain/shared/EntityId.js'
import { DEFAULT_SYSTEM_PROMPT, STATUS_ACTIVE } from '../../defaults.js'

interface CreateWorkspaceInput {
  name: string
  model: string
  teamId?: string
  teamName?: string
  systemPrompt?: string
  orgId: string
}

export class CreateWorkspaceUseCase {
  constructor(
    private readonly workspaceRepo: WorkspaceRepository,
    private readonly orgRepo: OrganisationRepository,
  ) {}

  async execute(input: CreateWorkspaceInput): Promise<{ id: string; name: string; status: string }> {
    const resolvedTeamId = await this.resolveTeam(input.orgId, input.teamId, input.teamName)
    const wsId = generateWorkspaceId()

    await this.workspaceRepo.create({
      id: wsId,
      orgId: input.orgId,
      teamId: resolvedTeamId,
      name: input.name,
      model: input.model,
      systemPrompt: input.systemPrompt || DEFAULT_SYSTEM_PROMPT,
    })

    return { id: wsId, name: input.name, status: STATUS_ACTIVE }
  }

  private async resolveTeam(orgId: string, teamId?: string, teamName?: string): Promise<string | null> {
    if (teamId) return teamId
    if (!teamName) return null

    const existing = await this.orgRepo.findTeamByName(orgId, teamName)
    if (existing) return existing.id

    const newTeamId = generateId()
    try {
      await this.orgRepo.createTeam(newTeamId, orgId, teamName)
      return newTeamId
    } catch (err: unknown) {
      if ((err as { code?: string }).code === 'ER_DUP_ENTRY') {
        const retry = await this.orgRepo.findTeamByName(orgId, teamName)
        if (retry) return retry.id
      }
      throw err
    }
  }
}
