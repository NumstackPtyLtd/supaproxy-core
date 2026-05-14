import { describe, it, expect, vi } from 'vitest'
import { InstallGuardrailUseCase } from './InstallGuardrailUseCase.js'

function mockDeps() {
  return {
    installedRepo: {
      findByOrg: vi.fn().mockResolvedValue([]),
      findByOrgAndPlugin: vi.fn().mockResolvedValue(null),
      install: vi.fn().mockResolvedValue(undefined),
      uninstall: vi.fn().mockResolvedValue(undefined),
    },
    pluginLoader: {
      load: vi.fn().mockResolvedValue({
        plugin_id: 'profanity-filter',
        metadata: { name: 'Profanity filter', description: 'Filters profanity', author: 'Test', version: '1.0.0', stage: 'pre-llm', configSchema: { fields: [] } },
        instance: {},
      }),
    },
    corePluginIds: new Set(['pattern', 'write-guard', 'injection-sanitiser']),
  }
}

describe('InstallGuardrailUseCase', () => {
  it('installs a marketplace plugin', async () => {
    const deps = mockDeps()
    const uc = new InstallGuardrailUseCase(deps.installedRepo, deps.pluginLoader, deps.corePluginIds)

    const result = await uc.execute('org-1', 'user-1', '@supaproxy/guardrail-profanity')

    expect(deps.pluginLoader.load).toHaveBeenCalledWith('@supaproxy/guardrail-profanity')
    expect(deps.installedRepo.install).toHaveBeenCalledWith(
      expect.objectContaining({
        org_id: 'org-1',
        plugin_id: 'profanity-filter',
        package_name: '@supaproxy/guardrail-profanity',
      }),
    )
    expect(result.plugin_id).toBe('profanity-filter')
  })

  it('rejects if plugin loader fails', async () => {
    const deps = mockDeps()
    deps.pluginLoader.load.mockResolvedValue(null)
    const uc = new InstallGuardrailUseCase(deps.installedRepo, deps.pluginLoader, deps.corePluginIds)

    await expect(uc.execute('org-1', 'user-1', 'bad-package')).rejects.toThrow()
  })

  it('rejects if plugin ID collides with a core plugin', async () => {
    const deps = mockDeps()
    deps.pluginLoader.load.mockResolvedValue({
      plugin_id: 'pattern',
      metadata: { name: 'Fake', description: '', author: '', version: '1.0.0', stage: 'pre-llm', configSchema: { fields: [] } },
      instance: {},
    })
    const uc = new InstallGuardrailUseCase(deps.installedRepo, deps.pluginLoader, deps.corePluginIds)

    await expect(uc.execute('org-1', 'user-1', 'fake-package')).rejects.toThrow('core')
  })

  it('rejects if already installed', async () => {
    const deps = mockDeps()
    deps.installedRepo.findByOrgAndPlugin.mockResolvedValue({ id: 'existing' })
    const uc = new InstallGuardrailUseCase(deps.installedRepo, deps.pluginLoader, deps.corePluginIds)

    await expect(uc.execute('org-1', 'user-1', '@supaproxy/guardrail-profanity')).rejects.toThrow('already installed')
  })
})
