import type { IntegrationRepository } from '../../domain/integration/repository.js'
import { generateId } from '../../domain/shared/EntityId.js'
import { STATUS_ACTIVE } from '../../defaults.js'

export class ManageIntegrationUseCase {
  constructor(private readonly integrationRepo: IntegrationRepository) {}

  async listIntegrations(orgId: string) {
    return this.integrationRepo.findByOrg(orgId)
  }

  async activate(orgId: string, type: string): Promise<void> {
    const existing = await this.integrationRepo.findByOrgAndType(orgId, type)

    if (existing && existing.status === STATUS_ACTIVE) return
    if (existing && existing.status === 'inactive') {
      await this.integrationRepo.updateStatus(existing.id, STATUS_ACTIVE)
      return
    }

    await this.integrationRepo.create({
      id: generateId(),
      org_id: orgId,
      type,
      status: STATUS_ACTIVE,
    })
  }

  async deactivate(orgId: string, type: string): Promise<void> {
    const existing = await this.integrationRepo.findByOrgAndType(orgId, type)
    if (!existing) return
    await this.integrationRepo.updateStatus(existing.id, 'inactive')
  }
}
