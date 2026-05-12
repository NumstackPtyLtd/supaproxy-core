import type { PromptTemplateRepository, PromptType, PromptScope } from '../../domain/prompt/repository.js'
import { checkPromptInjection } from './injection.js'
import { generateId } from '../../domain/shared/EntityId.js'
import { ValidationError } from '../../domain/shared/errors.js'

interface SavePromptInput {
  promptType: PromptType
  scope: PromptScope
  scopeId: string | null
  content: string
  isDraft: boolean
  createdBy: string | null
}

interface SavePromptOutput {
  id: string
  version: number
}

export class SavePromptUseCase {
  constructor(
    private readonly promptRepo: PromptTemplateRepository,
  ) {}

  async execute(input: SavePromptInput): Promise<SavePromptOutput> {
    // Injection detection
    const check = checkPromptInjection(input.content)
    if (!check.safe) {
      throw new ValidationError(
        `This prompt contains instructions that conflict with system guardrails: ${check.violations.join(', ')}`
      )
    }

    // Determine next version number
    const versions = await this.promptRepo.findVersions(input.promptType, input.scope, input.scopeId)
    const nextVersion = versions.length > 0 ? Math.max(...versions.map(v => v.version)) + 1 : 1

    // Deactivate existing active prompt for this type/scope
    if (!input.isDraft) {
      await this.promptRepo.deactivateAllForType(input.promptType, input.scope, input.scopeId)
    }

    const id = generateId()
    await this.promptRepo.create({
      id,
      promptType: input.promptType,
      scope: input.scope,
      scopeId: input.scopeId,
      content: input.content,
      version: nextVersion,
      isDraft: input.isDraft,
      createdBy: input.createdBy,
    })

    return { id, version: nextVersion }
  }
}
