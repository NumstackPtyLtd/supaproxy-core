import { describe, it, expect, vi } from 'vitest'
import { DeleteWorkspaceUseCase } from './DeleteWorkspaceUseCase.js'
import { mockWorkspaceRepo, stubWorkspace } from '../../__tests__/mocks.js'

describe('DeleteWorkspaceUseCase', () => {
  function setup() {
    const workspaceRepo = mockWorkspaceRepo()
    const useCase = new DeleteWorkspaceUseCase(workspaceRepo)
    return { workspaceRepo, useCase }
  }

  it('deletes an existing workspace', async () => {
    const { workspaceRepo, useCase } = setup()
    vi.mocked(workspaceRepo.findById).mockResolvedValue(stubWorkspace({ id: 'ws-1', is_default: false }))

    await useCase.execute('ws-1')

    expect(workspaceRepo.deleteWorkspace).toHaveBeenCalledWith('ws-1')
  })

  it('rejects deleting a non-existent workspace', async () => {
    const { workspaceRepo, useCase } = setup()
    vi.mocked(workspaceRepo.findById).mockResolvedValue(null)

    await expect(useCase.execute('ws-999')).rejects.toThrow()
  })

  it('rejects deleting a published (default) workspace', async () => {
    const { workspaceRepo, useCase } = setup()
    vi.mocked(workspaceRepo.findById).mockResolvedValue(stubWorkspace({ id: 'ws-1', is_default: true }))

    await expect(useCase.execute('ws-1')).rejects.toThrow('published')
  })
})
