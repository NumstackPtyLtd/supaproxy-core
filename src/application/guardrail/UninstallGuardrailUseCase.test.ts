import { describe, it, expect, vi } from 'vitest'
import { UninstallGuardrailUseCase } from './UninstallGuardrailUseCase.js'

function mockDeps() {
  return {
    installedRepo: {
      findByOrg: vi.fn().mockResolvedValue([]),
      findByOrgAndPlugin: vi.fn().mockResolvedValue({ id: 'inst-1', org_id: 'org-1', plugin_id: '@supaproxy/guardrail-profanity:profanity-filter', package_name: '@supaproxy/guardrail-profanity', package_version: '1.0.0', plugin_metadata: {}, installed_by: 'user-1' }),
      install: vi.fn().mockResolvedValue(undefined),
      uninstall: vi.fn().mockResolvedValue(undefined),
    },
    corePluginIds: new Set(['@supaproxy/guardrails:pattern', '@supaproxy/guardrails:write-guard', '@supaproxy/guardrails:injection-sanitiser']),
  }
}

describe('UninstallGuardrailUseCase', () => {
  it('uninstalls a marketplace plugin', async () => {
    const deps = mockDeps()
    const uc = new UninstallGuardrailUseCase(deps.installedRepo, deps.corePluginIds)

    await uc.execute('org-1', '@supaproxy/guardrail-profanity:profanity-filter')

    expect(deps.installedRepo.uninstall).toHaveBeenCalledWith('org-1', '@supaproxy/guardrail-profanity:profanity-filter')
  })

  it('rejects uninstalling a core plugin', async () => {
    const deps = mockDeps()
    const uc = new UninstallGuardrailUseCase(deps.installedRepo, deps.corePluginIds)

    await expect(uc.execute('org-1', '@supaproxy/guardrails:pattern')).rejects.toThrow('core')
  })

  it('rejects if plugin is not installed', async () => {
    const deps = mockDeps()
    deps.installedRepo.findByOrgAndPlugin.mockResolvedValue(null)
    const uc = new UninstallGuardrailUseCase(deps.installedRepo, deps.corePluginIds)

    await expect(uc.execute('org-1', 'unknown-plugin')).rejects.toThrow()
  })
})
