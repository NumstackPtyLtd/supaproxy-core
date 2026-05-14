import type { InstalledGuardrailRepository, InstalledGuardrailData } from '../../domain/guardrail/installedGuardrailRepository.js'
import type { PluginLoader } from '../ports/PluginLoader.js'
import { generateId } from '../../domain/shared/EntityId.js'
import { ValidationError, ConflictError } from '../../domain/shared/errors.js'

export class InstallGuardrailUseCase {
  constructor(
    private readonly installedRepo: InstalledGuardrailRepository,
    private readonly pluginLoader: PluginLoader,
    private readonly corePluginIds: Set<string>,
  ) {}

  async execute(orgId: string, userId: string, packageName: string): Promise<InstalledGuardrailData> {
    const loaded = await this.pluginLoader.load(packageName)
    if (!loaded) {
      throw new ValidationError(`Could not load guardrail plugin from package: ${packageName}`)
    }

    if (this.corePluginIds.has(loaded.plugin_id)) {
      throw new ValidationError(`Plugin ID "${loaded.plugin_id}" conflicts with a core plugin and cannot be installed`)
    }

    const existing = await this.installedRepo.findByOrgAndPlugin(orgId, loaded.plugin_id)
    if (existing) {
      throw new ConflictError(`Guardrail "${loaded.plugin_id}" is already installed`)
    }

    const data: InstalledGuardrailData = {
      id: generateId(),
      org_id: orgId,
      plugin_id: loaded.plugin_id,
      package_name: packageName,
      package_version: loaded.metadata.version,
      plugin_metadata: loaded.metadata,
      installed_by: userId,
    }

    await this.installedRepo.install(data)
    return data
  }
}
