import type { OrganisationRepository } from '../../domain/organisation/repository.js'
import type { WorkspaceRepository } from '../../domain/workspace/repository.js'
import type { PasswordService } from '../ports/PasswordService.js'
import type { TokenService } from '../ports/TokenService.js'
import { generateId, generateSlug, generateWorkspaceId } from '../../domain/shared/EntityId.js'
import { ConflictError } from '../../domain/shared/errors.js'

interface SignupInput {
  orgName: string
  adminName: string
  adminEmail: string
  adminPassword: string
  workspaceName?: string
  teamName?: string
  systemPrompt?: string
}

interface SignupOutput {
  orgId: string
  userId: string
  workspaceId: string
  token: string
}

export class SignupUseCase {
  constructor(
    private readonly orgRepo: OrganisationRepository,
    private readonly workspaceRepo: WorkspaceRepository,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
  ) {}

  async execute(input: SignupInput): Promise<SignupOutput> {
    const emailExists = await this.orgRepo.userExistsByEmail(input.adminEmail)
    if (emailExists) {
      throw new ConflictError('An account with this email already exists. Sign in instead.')
    }

    const orgId = generateId()
    const userId = generateId()
    const slug = generateSlug(input.orgName)

    await this.orgRepo.create(orgId, input.orgName, slug)

    const hash = await this.passwordService.hash(input.adminPassword)
    await this.orgRepo.createUser(userId, orgId, input.adminEmail, input.adminName, hash, 'admin')

    // Auto-create the #general default workspace (receptionist)
    const generalId = generateWorkspaceId('general')
    await this.workspaceRepo.create({
      id: generalId,
      orgId,
      teamId: null,
      name: '#general',
      model: '',
      systemPrompt: 'You are a helpful receptionist.',
      createdBy: userId,
    })
    await this.workspaceRepo.setDefault(generalId)

    // If the caller provided a workspace name, create that too
    let userWsId = generalId
    if (input.workspaceName) {
      const teamId = input.teamName ? await this.resolveTeam(orgId, input.teamName) : null
      userWsId = generateWorkspaceId(input.workspaceName)
      await this.workspaceRepo.create({
        id: userWsId,
        orgId,
        teamId,
        name: input.workspaceName,
        model: '',
        systemPrompt: input.systemPrompt || 'You are a helpful assistant.',
        createdBy: userId,
      })
    }

    const token = this.tokenService.sign({
      id: userId,
      email: input.adminEmail,
      name: input.adminName,
      role: 'admin',
      org_id: orgId,
    })

    return { orgId, userId, workspaceId: userWsId, token }
  }

  private async resolveTeam(orgId: string, teamName: string): Promise<string> {
    const existing = await this.orgRepo.findTeamByName(orgId, teamName)
    if (existing) return existing.id

    const teamId = generateId()
    try {
      await this.orgRepo.createTeam(teamId, orgId, teamName)
    } catch (err: unknown) {
      if ((err as { code?: string }).code === 'ER_DUP_ENTRY') {
        const retry = await this.orgRepo.findTeamByName(orgId, teamName)
        if (retry) return retry.id
      }
      throw err
    }
    return teamId
  }
}
