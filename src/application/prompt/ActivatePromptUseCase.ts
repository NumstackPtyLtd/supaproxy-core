import type { PromptTemplateRepository, PromptType, PromptScope } from '../../domain/prompt/repository.js'

export class ActivatePromptUseCase {
  constructor(private readonly promptRepo: PromptTemplateRepository) {}

  async execute(promptType: PromptType, id: string, scope: PromptScope, scopeId: string): Promise<void> {
    await this.promptRepo.deactivateAllForType(promptType, scope, scopeId)
    await this.promptRepo.activate(id)
  }
}
