import { describe, it, expect } from 'vitest'
import { Integration } from './Integration.js'
import { IntegrationStatus } from './IntegrationStatus.js'

function makeIntegration(overrides: Partial<Parameters<typeof Integration.fromData>[0]> = {}) {
  return Integration.fromData({
    id: 'int-1', org_id: 'org-1', type: 'slack', status: IntegrationStatus.ACTIVE,
    ...overrides,
  })
}

describe('Integration', () => {
  describe('isActive', () => {
    it('returns true for active integrations', () => {
      expect(makeIntegration().isActive()).toBe(true)
    })

    it('returns false for inactive integrations', () => {
      expect(makeIntegration({ status: IntegrationStatus.INACTIVE }).isActive()).toBe(false)
    })
  })

  describe('activate', () => {
    it('transitions inactive to active', () => {
      const int = makeIntegration({ status: IntegrationStatus.INACTIVE })
      int.activate()
      expect(int.status).toBe(IntegrationStatus.ACTIVE)
    })

    it('is idempotent for active integrations', () => {
      const int = makeIntegration({ status: IntegrationStatus.ACTIVE })
      int.activate()
      expect(int.status).toBe(IntegrationStatus.ACTIVE)
    })
  })

  describe('deactivate', () => {
    it('transitions active to inactive', () => {
      const int = makeIntegration({ status: IntegrationStatus.ACTIVE })
      int.deactivate()
      expect(int.status).toBe(IntegrationStatus.INACTIVE)
    })

    it('is idempotent for inactive integrations', () => {
      const int = makeIntegration({ status: IntegrationStatus.INACTIVE })
      int.deactivate()
      expect(int.status).toBe(IntegrationStatus.INACTIVE)
    })
  })

  describe('properties', () => {
    it('exposes id, orgId, and type', () => {
      const int = makeIntegration({ id: 'int-42', org_id: 'org-99', type: 'whatsapp' })
      expect(int.id).toBe('int-42')
      expect(int.orgId).toBe('org-99')
      expect(int.type).toBe('whatsapp')
    })
  })
})
