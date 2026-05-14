import { describe, it, expect, vi } from 'vitest'
import { PublishWorkspaceUseCase } from './PublishWorkspaceUseCase.js'
import { mockWorkspaceRepo, stubWorkspace } from '../../__tests__/mocks.js'

describe('PublishWorkspaceUseCase', () => {
  function setup() {
    const workspaceRepo = mockWorkspaceRepo()
    const useCase = new PublishWorkspaceUseCase(workspaceRepo)
    return { workspaceRepo, useCase }
  }

  it('publishes a workspace', async () => {
    const { workspaceRepo, useCase } = setup()
    vi.mocked(workspaceRepo.findById).mockResolvedValue(stubWorkspace({ id: 'ws-1', is_default: false }))

    await useCase.execute('ws-1', true)

    expect(workspaceRepo.setDefault).toHaveBeenCalledWith('ws-1')
  })

  it('unpublishes a workspace', async () => {
    const { workspaceRepo, useCase } = setup()
    vi.mocked(workspaceRepo.findById).mockResolvedValue(stubWorkspace({ id: 'ws-1', is_default: true }))

    await useCase.execute('ws-1', false)

    expect(workspaceRepo.unsetDefault).toHaveBeenCalledWith('ws-1')
  })

  it('rejects unpublishing #general', async () => {
    const { workspaceRepo, useCase } = setup()
    vi.mocked(workspaceRepo.findById).mockResolvedValue(stubWorkspace({ id: 'ws-1', name: '#general', is_default: true }))

    await expect(useCase.execute('ws-1', false)).rejects.toThrow('#general')
  })

  it('rejects if workspace not found', async () => {
    const { workspaceRepo, useCase } = setup()
    vi.mocked(workspaceRepo.findById).mockResolvedValue(null)

    await expect(useCase.execute('ws-999', true)).rejects.toThrow()
  })
})
