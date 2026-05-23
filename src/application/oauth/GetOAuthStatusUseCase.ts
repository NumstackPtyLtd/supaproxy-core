import type { OrganisationRepository } from '../../domain/organisation/repository.js'

export class GetOAuthStatusUseCase {
  constructor(private readonly orgRepo: OrganisationRepository) {}

  async execute(pluginId: string): Promise<{ connected: boolean; site: string | null }> {
    const orgId = await this.orgRepo.getFirstOrgId()
    if (!orgId) return { connected: false, site: null }

    const token = await this.orgRepo.findSetting(orgId, `${pluginId}_access_token`)
    const resourceUrl = await this.orgRepo.findSetting(orgId, `${pluginId}_resource_url`)
    return { connected: !!token?.value, site: resourceUrl?.value || null }
  }
}
