import type { PromptTemplateRepository } from '../../domain/prompt/repository.js'

export class ListPromptsUseCase {
  constructor(private readonly promptRepo: PromptTemplateRepository) {}

  async execute(orgId: string) {
    return this.promptRepo.findAllActive('org', orgId)
  }
}
