import type { PromptTemplateRepository, PromptType, PromptScope } from '../../domain/prompt/repository.js'

export class GetPromptVersionsUseCase {
  constructor(private readonly promptRepo: PromptTemplateRepository) {}

  async execute(promptType: PromptType, scope: PromptScope, scopeId: string) {
    return this.promptRepo.findVersions(promptType, scope, scopeId)
  }
}
