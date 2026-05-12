import { describe, it, expect, vi } from 'vitest'
import { mockWorkspaceRepo, mockOrgRepo } from '../../__tests__/mocks.js'
import { CreateWorkspaceUseCase } from './CreateWorkspaceUseCase.js'

describe('CreateWorkspaceUseCase', () => {
  it('creates workspace with random ID (org-safe)', async () => {
    const wsRepo = mockWorkspaceRepo()
    const orgRepo = mockOrgRepo()
    const uc = new CreateWorkspaceUseCase(wsRepo, orgRepo)

    const result = await uc.execute({
      name: 'My Workspace',
      model: 'test-model',
      teamId: 'team-1',
      orgId: 'org-1',
    })

    expect(result.id).toMatch(/^ws-[0-9a-f]{24}$/)
    expect(result.name).toBe('My Workspace')
    expect(result.status).toBe('active')
    expect(wsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.stringMatching(/^ws-/),
        orgId: 'org-1',
        teamId: 'team-1',
        name: 'My Workspace',
      }),
    )
  })

  it('two workspaces with the same name get different IDs', async () => {
    const wsRepo = mockWorkspaceRepo()
    const orgRepo = mockOrgRepo()
    const uc = new CreateWorkspaceUseCase(wsRepo, orgRepo)

    const result1 = await uc.execute({ name: 'Insurance', model: 'test-model', orgId: 'org-1' })
    const result2 = await uc.execute({ name: 'Insurance', model: 'test-model', orgId: 'org-2' })

    expect(result1.id).not.toBe(result2.id)
  })

  it('creates workspace with new team name', async () => {
    const wsRepo = mockWorkspaceRepo()
    const orgRepo = mockOrgRepo()
    const uc = new CreateWorkspaceUseCase(wsRepo, orgRepo)

    vi.mocked(orgRepo.findTeamByName).mockResolvedValue(null)

    const result = await uc.execute({
      name: 'Support Bot',
      model: 'test-model',
      teamName: 'Support Team',
      orgId: 'org-1',
    })

    expect(result.id).toMatch(/^ws-/)
    expect(orgRepo.findTeamByName).toHaveBeenCalledWith('org-1', 'Support Team')
    expect(orgRepo.createTeam).toHaveBeenCalledWith(expect.any(String), 'org-1', 'Support Team')
  })

  it('uses existing team when teamId provided', async () => {
    const wsRepo = mockWorkspaceRepo()
    const orgRepo = mockOrgRepo()
    const uc = new CreateWorkspaceUseCase(wsRepo, orgRepo)

    await uc.execute({
      name: 'Test',
      model: 'test-model',
      teamId: 'team-existing',
      orgId: 'org-1',
    })

    expect(orgRepo.findTeamByName).not.toHaveBeenCalled()
    expect(wsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ teamId: 'team-existing' }),
    )
  })
})
