import { describe, it, expect, vi } from 'vitest'
import { ManageIntegrationUseCase } from './ManageIntegrationUseCase.js'
import { mockIntegrationRepo } from '../../__tests__/mocks.js'
import type { IntegrationData } from '../../domain/integration/repository.js'

describe('ManageIntegrationUseCase', () => {
  function setup() {
    const integrationRepo = mockIntegrationRepo()
    const useCase = new ManageIntegrationUseCase(integrationRepo)
    return { integrationRepo, useCase }
  }

  describe('listIntegrations', () => {
    it('returns all integrations for the org', async () => {
      const { integrationRepo, useCase } = setup()
      const integrations: IntegrationData[] = [
        { id: 'i1', org_id: 'org-1', type: 'slack', status: 'active' },
        { id: 'i2', org_id: 'org-1', type: 'whatsapp', status: 'active' },
      ]
      vi.mocked(integrationRepo.findByOrg).mockResolvedValue(integrations)

      const result = await useCase.listIntegrations('org-1')
      expect(result).toEqual(integrations)
    })
  })

  describe('activate', () => {
    it('creates an integration if none exists', async () => {
      const { integrationRepo, useCase } = setup()
      vi.mocked(integrationRepo.findByOrgAndType).mockResolvedValue(null)

      await useCase.activate('org-1', 'slack')

      expect(integrationRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ org_id: 'org-1', type: 'slack', status: 'active' }),
      )
    })

    it('reactivates an inactive integration', async () => {
      const { integrationRepo, useCase } = setup()
      vi.mocked(integrationRepo.findByOrgAndType).mockResolvedValue(
        { id: 'i1', org_id: 'org-1', type: 'slack', status: 'inactive' },
      )

      await useCase.activate('org-1', 'slack')

      expect(integrationRepo.updateStatus).toHaveBeenCalledWith('i1', 'active')
    })

    it('does nothing if already active', async () => {
      const { integrationRepo, useCase } = setup()
      vi.mocked(integrationRepo.findByOrgAndType).mockResolvedValue(
        { id: 'i1', org_id: 'org-1', type: 'slack', status: 'active' },
      )

      await useCase.activate('org-1', 'slack')

      expect(integrationRepo.create).not.toHaveBeenCalled()
      expect(integrationRepo.updateStatus).not.toHaveBeenCalled()
    })
  })

  describe('deactivate', () => {
    it('sets integration to inactive', async () => {
      const { integrationRepo, useCase } = setup()
      vi.mocked(integrationRepo.findByOrgAndType).mockResolvedValue(
        { id: 'i1', org_id: 'org-1', type: 'slack', status: 'active' },
      )

      await useCase.deactivate('org-1', 'slack')

      expect(integrationRepo.updateStatus).toHaveBeenCalledWith('i1', 'inactive')
    })

    it('does nothing if not found', async () => {
      const { integrationRepo, useCase } = setup()
      vi.mocked(integrationRepo.findByOrgAndType).mockResolvedValue(null)

      await useCase.deactivate('org-1', 'slack')

      expect(integrationRepo.updateStatus).not.toHaveBeenCalled()
    })
  })
})
