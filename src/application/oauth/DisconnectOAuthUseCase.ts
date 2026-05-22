import type { OrganisationRepository } from '../../domain/organisation/repository.js'
import { OAUTH_SETTING_SUFFIXES, ERROR_NO_ORG } from '../../defaults.js'
import pino from 'pino'

const log = pino({ name: 'disconnect-oauth' })

export class DisconnectOAuthUseCase {
  constructor(
    private readonly orgRepo: OrganisationRepository,
  ) {}

  async execute(pluginId: string): Promise<{ disconnected: boolean }> {
    const orgId = await this.orgRepo.getFirstOrgId()
    if (!orgId) throw new Error(ERROR_NO_ORG)

    for (const suffix of OAUTH_SETTING_SUFFIXES) {
      const key = `${pluginId}_${suffix}`
      const setting = await this.orgRepo.findSetting(orgId, key)
      if (setting) {
        await this.orgRepo.upsertSetting(setting.id, orgId, key, '', false)
      }
    }

    log.info({ pluginId }, 'OAuth connection removed')
    return { disconnected: true }
  }
}
