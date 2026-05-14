import { describe, it, expect, vi } from 'vitest'
import { mockOrgRepo, mockWorkspaceRepo, mockPasswordService, mockTokenService, mockTenantService } from '../../__tests__/mocks.js'
import { SignupUseCase } from './SignupUseCase.js'
import { ConflictError } from '../../domain/shared/errors.js'

describe('SignupUseCase', () => {
  function setup(allowMultipleOrgs = false) {
    const orgRepo = mockOrgRepo()
    const workspaceRepo = mockWorkspaceRepo()
    const passwordService = mockPasswordService()
    const tokenService = mockTokenService()
    const tenantService = mockTenantService({ allowMultipleOrgs })
    const useCase = new SignupUseCase(orgRepo, workspaceRepo, passwordService, tokenService, tenantService)
    return { orgRepo, workspaceRepo, passwordService, tokenService, tenantService, useCase }
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
    expect(result.workspaceId).toMatch(/^ws-[0-9a-f]{24}$/)
    expect(result.token).toBe('signup-token')
  })

  it('throws ConflictError if email already exists', async () => {
    const { orgRepo, useCase } = setup()
    vi.mocked(orgRepo.userExistsByEmail).mockResolvedValue(true)

    await expect(useCase.execute(validInput)).rejects.toThrow(ConflictError)
    expect(orgRepo.create).not.toHaveBeenCalled()
  })

  it('rejects signup in single-tenant mode when an org already exists', async () => {
    const { orgRepo, useCase } = setup(false)
    vi.mocked(orgRepo.anyExists).mockResolvedValue(true)

    await expect(useCase.execute(validInput)).rejects.toThrow(ConflictError)
    expect(orgRepo.create).not.toHaveBeenCalled()
  })

  it('allows signup in multi-tenant mode when an org already exists', async () => {
    const { orgRepo, useCase } = setup(true)
    vi.mocked(orgRepo.anyExists).mockResolvedValue(true)
    vi.mocked(orgRepo.userExistsByEmail).mockResolvedValue(false)

    const result = await useCase.execute(validInput)

    expect(result).toHaveProperty('orgId')
  })
})
