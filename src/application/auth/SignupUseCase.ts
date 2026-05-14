import type { OrganisationRepository } from '../../domain/organisation/repository.js'
import type { WorkspaceRepository } from '../../domain/workspace/repository.js'
import type { PasswordService } from '../ports/PasswordService.js'
import type { TokenService } from '../ports/TokenService.js'
import type { TenantService } from '../ports/TenantService.js'
import { generateId, generateSlug, generateWorkspaceId } from '../../domain/shared/EntityId.js'
import { ConflictError } from '../../domain/shared/errors.js'
import { DEFAULT_WORKSPACE_NAME, DEFAULT_RECEPTIONIST_PROMPT } from '../../defaults.js'

interface SignupInput {
  orgName: string
  adminName: string
  adminEmail: string
  adminPassword: string
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
    private readonly tenantService: TenantService,
  ) {}

  async execute(input: SignupInput): Promise<SignupOutput> {
    if (!this.tenantService.allowMultipleOrgs) {
      const orgExists = await this.orgRepo.anyExists()
      if (orgExists) {
        throw new ConflictError('An organisation already exists. Sign in instead.')
      }
    }

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
    const generalId = generateWorkspaceId()
    await this.workspaceRepo.create({
      id: generalId,
      orgId,
      teamId: null,
      name: DEFAULT_WORKSPACE_NAME,
      model: '',
      systemPrompt: DEFAULT_RECEPTIONIST_PROMPT,
      createdBy: userId,
    })
    await this.workspaceRepo.setDefault(generalId)

    const userWsId = generalId

    const token = this.tokenService.sign({
      id: userId,
      email: input.adminEmail,
      name: input.adminName,
      role: 'admin',
      org_id: orgId,
    })

    return { orgId, userId, workspaceId: userWsId, token }
  }
}
