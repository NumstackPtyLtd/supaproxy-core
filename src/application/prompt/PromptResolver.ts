import type { PromptTemplateRepository, PromptType } from '../../domain/prompt/repository.js'
import * as systemDefaults from '../../prompts.js'

/**
 * Resolves prompts using a three-tier hierarchy:
 * workspace override > org override > system default (prompts.ts)
 */
export class PromptResolver {
  constructor(
    private readonly promptRepo: PromptTemplateRepository,
  ) {}

  async resolve(promptType: PromptType, orgId: string, workspaceId?: string): Promise<string> {
    // Tier 1: workspace override
    if (workspaceId) {
      const wsPrompt = await this.promptRepo.findActive(promptType, 'workspace', workspaceId)
      if (wsPrompt) return wsPrompt.content
    }

    // Tier 2: org override
    const orgPrompt = await this.promptRepo.findActive(promptType, 'org', orgId)
    if (orgPrompt) return orgPrompt.content

    // Tier 3: system default
    return this.getSystemDefault(promptType)
  }

  private getSystemDefault(promptType: PromptType): string {
    switch (promptType) {
      case 'scope_enforcement': return systemDefaults.buildScopeEnforcementClause()
      case 'out_of_scope_message': return systemDefaults.DEFAULT_OUT_OF_SCOPE_MESSAGE
      case 'cold_message': return systemDefaults.DEFAULT_COLD_FALLBACK_MESSAGE
      case 'system_prompt': return ''
      case 'receptionist': return ''
      case 'analysis': return ''
      case 'agent_intro': return ''
      default: return ''
    }
  }
}
