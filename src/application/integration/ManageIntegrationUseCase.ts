import type { IntegrationRepository } from '../../domain/integration/repository.js'
import { Integration } from '../../domain/integration/Integration.js'
import { generateId } from '../../domain/shared/EntityId.js'
import { IntegrationStatus } from '../../domain/integration/IntegrationStatus.js'

export class ManageIntegrationUseCase {
  constructor(private readonly integrationRepo: IntegrationRepository) {}

  async listIntegrations(orgId: string) {
    return this.integrationRepo.findByOrg(orgId)
  }

  async activate(orgId: string, type: string): Promise<void> {
    const existing = await this.integrationRepo.findByOrgAndType(orgId, type)

    if (existing) {
      const integration = Integration.fromData(existing)
      if (integration.isActive()) return
      integration.activate()
      await this.integrationRepo.updateStatus(existing.id, integration.status)
      return
    }

    await this.integrationRepo.create({
      id: generateId(),
      org_id: orgId,
      type,
      status: IntegrationStatus.ACTIVE,
    })
  }

  async deactivate(orgId: string, type: string): Promise<void> {
    const existing = await this.integrationRepo.findByOrgAndType(orgId, type)
    if (!existing) return
    const integration = Integration.fromData(existing)
    integration.deactivate()
    await this.integrationRepo.updateStatus(existing.id, integration.status)
  }
}
