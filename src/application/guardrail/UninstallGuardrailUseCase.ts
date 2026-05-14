import type { InstalledGuardrailRepository } from '../../domain/guardrail/installedGuardrailRepository.js'
import { ValidationError, NotFoundError } from '../../domain/shared/errors.js'

export class UninstallGuardrailUseCase {
  constructor(
    private readonly installedRepo: InstalledGuardrailRepository,
    private readonly corePluginIds: Set<string>,
  ) {}

  async execute(orgId: string, pluginId: string): Promise<void> {
    if (this.corePluginIds.has(pluginId)) {
      throw new ValidationError(`"${pluginId}" is a core plugin and cannot be uninstalled`)
    }

    const existing = await this.installedRepo.findByOrgAndPlugin(orgId, pluginId)
    if (!existing) {
      throw new NotFoundError('InstalledGuardrail', pluginId)
    }

    await this.installedRepo.uninstall(orgId, pluginId)
  }
}
