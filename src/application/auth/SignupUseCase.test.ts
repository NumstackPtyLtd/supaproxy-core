import { describe, it, expect, vi } from 'vitest'
import { mockOrgRepo, mockWorkspaceRepo, mockPasswordService, mockTokenService } from '../../__tests__/mocks.js'
import { SignupUseCase } from './SignupUseCase.js'
import { ConflictError } from '../../domain/shared/errors.js'

describe('SignupUseCase', () => {
  function setup() {
    const orgRepo = mockOrgRepo()
    const workspaceRepo = mockWorkspaceRepo()
    const passwordService = mockPasswordService()
    const tokenService = mockTokenService()
    const useCase = new SignupUseCase(orgRepo, workspaceRepo, passwordService, tokenService)
    return { orgRepo, workspaceRepo, passwordService, tokenService, useCase }
  }

  const validInput = {
    orgName: 'Acme Corp',
    adminName: 'Alice',
    adminEmail: 'alice@acme.com',
    adminPassword: 'securepassword',
    workspaceName: 'Support',
    teamName: 'Engineering',
  }

  it('creates org, user, #general default workspace, and user workspace', async () => {
    const { orgRepo, workspaceRepo, passwordService, tokenService, useCase } = setup()
    vi.mocked(orgRepo.userExistsByEmail).mockResolvedValue(false)
    vi.mocked(orgRepo.findTeamByName).mockResolvedValue(null)
    vi.mocked(passwordService.hash).mockResolvedValue('hashed-pw')
    vi.mocked(tokenService.sign).mockReturnValue('signup-token')

    const result = await useCase.execute(validInput)

    expect(orgRepo.userExistsByEmail).toHaveBeenCalledWith('alice@acme.com')
    expect(orgRepo.create).toHaveBeenCalledTimes(1)
    expect(passwordService.hash).toHaveBeenCalledWith('securepassword')
    expect(orgRepo.createUser).toHaveBeenCalledTimes(1)

    // #general created first, then the user workspace
    expect(workspaceRepo.create).toHaveBeenCalledTimes(2)
    expect(workspaceRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: '#general' }),
    )
    expect(workspaceRepo.setDefault).toHaveBeenCalledTimes(1)
    expect(orgRepo.createTeam).toHaveBeenCalledTimes(1)
    expect(workspaceRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Support' }),
    )
    expect(tokenService.sign).toHaveBeenCalledTimes(1)

    expect(result).toHaveProperty('orgId')
    expect(result).toHaveProperty('userId')
    expect(result.workspaceId).toBe('ws-support')
    expect(result.token).toBe('signup-token')
  })

  it('creates only #general when no workspace name provided', async () => {
    const { orgRepo, workspaceRepo, useCase } = setup()
    vi.mocked(orgRepo.userExistsByEmail).mockResolvedValue(false)

    const result = await useCase.execute({
      orgName: 'Acme Corp',
      adminName: 'Alice',
      adminEmail: 'alice@acme.com',
      adminPassword: 'securepassword',
    })

    expect(workspaceRepo.create).toHaveBeenCalledTimes(1)
    expect(workspaceRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: '#general' }),
    )
    expect(workspaceRepo.setDefault).toHaveBeenCalledTimes(1)
    expect(result.workspaceId).toBe('ws-acme-corp-general')
  })

  it('throws ConflictError if email already exists', async () => {
    const { orgRepo, useCase } = setup()
    vi.mocked(orgRepo.userExistsByEmail).mockResolvedValue(true)

    await expect(useCase.execute(validInput)).rejects.toThrow(ConflictError)
    expect(orgRepo.create).not.toHaveBeenCalled()
  })

  it('handles concurrent team creation (ER_DUP_ENTRY)', async () => {
    const { orgRepo, workspaceRepo, useCase } = setup()
    vi.mocked(orgRepo.userExistsByEmail).mockResolvedValue(false)
    vi.mocked(orgRepo.findTeamByName)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'existing-team-id', name: 'Engineering' })

    const dupError = new Error('Duplicate entry') as Error & { code: string }
    dupError.code = 'ER_DUP_ENTRY'
    vi.mocked(orgRepo.createTeam).mockRejectedValue(dupError)

    const result = await useCase.execute(validInput)

    expect(orgRepo.findTeamByName).toHaveBeenCalledTimes(2)
    // The user workspace (not #general) should have the team
    expect(workspaceRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ teamId: 'existing-team-id', name: 'Support' }),
    )
    expect(result).toHaveProperty('orgId')
  })
})
