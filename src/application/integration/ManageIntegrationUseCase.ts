import type { IntegrationRepository } from '../../domain/integration/repository.js'
import { generateId } from '../../domain/shared/EntityId.js'

export class ManageIntegrationUseCase {
  constructor(private readonly integrationRepo: IntegrationRepository) {}

  async listIntegrations(orgId: string) {
    return this.integrationRepo.findByOrg(orgId)
  }

  async activate(orgId: string, type: string): Promise<void> {
    const existing = await this.integrationRepo.findByOrgAndType(orgId, type)

    if (existing && existing.status === 'active') return
    if (existing && existing.status === 'inactive') {
      await this.integrationRepo.updateStatus(existing.id, 'active')
      return
    }

    await this.integrationRepo.create({
      id: generateId(),
      org_id: orgId,
      type,
      status: 'active',
    })
  }

  async deactivate(orgId: string, type: string): Promise<void> {
    const existing = await this.integrationRepo.findByOrgAndType(orgId, type)
    if (!existing) return
    await this.integrationRepo.updateStatus(existing.id, 'inactive')
  }
}
