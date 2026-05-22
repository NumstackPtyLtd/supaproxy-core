import type { IntegrationRepository } from '../../domain/integration/repository.js'
import { generateId } from '../../domain/shared/EntityId.js'
import { IntegrationStatus } from '../../domain/integration/IntegrationStatus.js'

export class ManageIntegrationUseCase {
  constructor(private readonly integrationRepo: IntegrationRepository) {}

  async listIntegrations(orgId: string) {
    return this.integrationRepo.findByOrg(orgId)
  }

  async activate(orgId: string, type: string): Promise<void> {
    const existing = await this.integrationRepo.findByOrgAndType(orgId, type)

    if (existing && existing.status === IntegrationStatus.ACTIVE) return
    if (existing && existing.status === IntegrationStatus.INACTIVE) {
      await this.integrationRepo.updateStatus(existing.id, IntegrationStatus.ACTIVE)
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
    await this.integrationRepo.updateStatus(existing.id, IntegrationStatus.INACTIVE)
  }
}
