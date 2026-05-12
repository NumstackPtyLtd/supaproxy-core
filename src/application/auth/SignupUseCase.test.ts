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
  }

  it('creates org, user, and #general default workspace', async () => {
    const { orgRepo, workspaceRepo, passwordService, tokenService, useCase } = setup()
    vi.mocked(orgRepo.userExistsByEmail).mockResolvedValue(false)
    vi.mocked(passwordService.hash).mockResolvedValue('hashed-pw')
    vi.mocked(tokenService.sign).mockReturnValue('signup-token')

    const result = await useCase.execute(validInput)

    expect(orgRepo.userExistsByEmail).toHaveBeenCalledWith('alice@acme.com')
    expect(orgRepo.create).toHaveBeenCalledTimes(1)
    expect(passwordService.hash).toHaveBeenCalledWith('securepassword')
    expect(orgRepo.createUser).toHaveBeenCalledTimes(1)

    // Only #general created
    expect(workspaceRepo.create).toHaveBeenCalledTimes(1)
    expect(workspaceRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: '#general' }),
    )
    expect(workspaceRepo.setDefault).toHaveBeenCalledTimes(1)
    expect(tokenService.sign).toHaveBeenCalledTimes(1)

    expect(result).toHaveProperty('orgId')
    expect(result).toHaveProperty('userId')
    expect(result.workspaceId).toBe('ws-acme-corp-general')
    expect(result.token).toBe('signup-token')
  })

  it('throws ConflictError if email already exists', async () => {
    const { orgRepo, useCase } = setup()
    vi.mocked(orgRepo.userExistsByEmail).mockResolvedValue(true)

    await expect(useCase.execute(validInput)).rejects.toThrow(ConflictError)
    expect(orgRepo.create).not.toHaveBeenCalled()
  })
})
