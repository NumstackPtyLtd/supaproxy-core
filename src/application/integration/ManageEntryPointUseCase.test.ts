import { describe, it, expect, vi } from 'vitest'
import { ManageEntryPointUseCase } from './ManageEntryPointUseCase.js'
import { mockIntegrationRepo, mockEntryPointRepo } from '../../__tests__/mocks.js'
import type { EntryPointData } from '../../domain/integration/repository.js'

describe('ManageEntryPointUseCase', () => {
  function setup() {
    const integrationRepo = mockIntegrationRepo()
    const entryPointRepo = mockEntryPointRepo()
    const useCase = new ManageEntryPointUseCase(integrationRepo, entryPointRepo)
    return { integrationRepo, entryPointRepo, useCase }
  }

  describe('listEntryPoints', () => {
    it('returns entry points for an integration', async () => {
      const { entryPointRepo, useCase } = setup()
      const eps: EntryPointData[] = [
        { id: 'ep1', integration_id: 'i1', channel_id: 'C123', channel_name: '#general', direct: false, direct_workspace_id: null },
      ]
      vi.mocked(entryPointRepo.findByIntegration).mockResolvedValue(eps)

      const result = await useCase.listEntryPoints('i1')
      expect(result).toEqual(eps)
    })
  })

  describe('createEntryPoint', () => {
    it('creates an entry point with non-direct mode by default', async () => {
      const { integrationRepo, entryPointRepo, useCase } = setup()
      vi.mocked(integrationRepo.findByOrgAndType).mockResolvedValue({ id: 'i1', org_id: 'org-1', type: 'slack', status: 'active' })

      await useCase.createEntryPoint('org-1', 'slack', { channel_id: 'C123', channel_name: '#support' })

      expect(entryPointRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          integration_id: 'i1',
          channel_id: 'C123',
          channel_name: '#support',
          direct: false,
          direct_workspace_id: null,
        }),
      )
    })

    it('creates an entry point with direct mode', async () => {
      const { integrationRepo, entryPointRepo, useCase } = setup()
      vi.mocked(integrationRepo.findByOrgAndType).mockResolvedValue({ id: 'i1', org_id: 'org-1', type: 'slack', status: 'active' })

      await useCase.createEntryPoint('org-1', 'slack', {
        channel_id: 'C456',
        channel_name: '#billing',
        direct: true,
        direct_workspace_id: 'ws-billing',
      })

      expect(entryPointRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          direct: true,
          direct_workspace_id: 'ws-billing',
        }),
      )
    })

    it('rejects if integration not found', async () => {
      const { integrationRepo, useCase } = setup()
      vi.mocked(integrationRepo.findByOrgAndType).mockResolvedValue(null)

      await expect(useCase.createEntryPoint('org-1', 'slack', { channel_id: 'C123' })).rejects.toThrow()
    })
  })

  describe('updateEntryPoint', () => {
    it('updates direct mode', async () => {
      const { entryPointRepo, useCase } = setup()
      vi.mocked(entryPointRepo.findById).mockResolvedValue({
        id: 'ep1', integration_id: 'i1', channel_id: 'C123', channel_name: '#general',
        direct: false, direct_workspace_id: null,
      })

      await useCase.updateEntryPoint('ep1', { direct: true, direct_workspace_id: 'ws-1' })

      expect(entryPointRepo.update).toHaveBeenCalledWith('ep1', { direct: true, direct_workspace_id: 'ws-1' })
    })

    it('rejects if entry point not found', async () => {
      const { entryPointRepo, useCase } = setup()
      vi.mocked(entryPointRepo.findById).mockResolvedValue(null)

      await expect(useCase.updateEntryPoint('ep-999', { direct: true })).rejects.toThrow()
    })

    it('clears direct_workspace_id when switching to non-direct', async () => {
      const { entryPointRepo, useCase } = setup()
      vi.mocked(entryPointRepo.findById).mockResolvedValue({
        id: 'ep1', integration_id: 'i1', channel_id: 'C123', channel_name: '#general',
        direct: true, direct_workspace_id: 'ws-1',
      })

      await useCase.updateEntryPoint('ep1', { direct: false })

      expect(entryPointRepo.update).toHaveBeenCalledWith('ep1', { direct: false, direct_workspace_id: null })
    })
  })

  describe('deleteEntryPoint', () => {
    it('deletes an entry point', async () => {
      const { entryPointRepo, useCase } = setup()
      vi.mocked(entryPointRepo.findById).mockResolvedValue({
        id: 'ep1', integration_id: 'i1', channel_id: 'C123', channel_name: '#general',
        direct: false, direct_workspace_id: null,
      })

      await useCase.deleteEntryPoint('ep1')

      expect(entryPointRepo.delete).toHaveBeenCalledWith('ep1')
    })

    it('rejects if entry point not found', async () => {
      const { entryPointRepo, useCase } = setup()
      vi.mocked(entryPointRepo.findById).mockResolvedValue(null)

      await expect(useCase.deleteEntryPoint('ep-999')).rejects.toThrow()
    })
  })

  describe('resolveRouting', () => {
    it('returns receptionist when no entry point exists', async () => {
      const { entryPointRepo, useCase } = setup()
      vi.mocked(entryPointRepo.findByChannel).mockResolvedValue(null)

      const result = await useCase.resolveRouting('slack', 'C123')
      expect(result).toEqual({ mode: 'receptionist' })
    })

    it('returns receptionist for non-direct entry points', async () => {
      const { entryPointRepo, useCase } = setup()
      vi.mocked(entryPointRepo.findByChannel).mockResolvedValue({
        id: 'ep1', integration_id: 'i1', channel_id: 'C123', channel_name: '#general',
        direct: false, direct_workspace_id: null,
        integration_type: 'slack', org_id: 'org-1',
      })

      const result = await useCase.resolveRouting('slack', 'C123')
      expect(result).toEqual({ mode: 'receptionist', orgId: 'org-1' })
    })

    it('returns direct with workspace ID for direct entry points', async () => {
      const { entryPointRepo, useCase } = setup()
      vi.mocked(entryPointRepo.findByChannel).mockResolvedValue({
        id: 'ep1', integration_id: 'i1', channel_id: 'C456', channel_name: '#billing',
        direct: true, direct_workspace_id: 'ws-billing',
        integration_type: 'slack', org_id: 'org-1',
      })

      const result = await useCase.resolveRouting('slack', 'C456')
      expect(result).toEqual({ mode: 'direct', workspaceId: 'ws-billing', orgId: 'org-1' })
    })
  })
})
