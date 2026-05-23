import type { GuardrailEventRepository, EventStatus } from '../../domain/guardrail/repository.js'
import { ValidationError } from '../../domain/shared/errors.js'

const VALID_STATUSES: readonly EventStatus[] = ['open', 'flagged', 'dismissed']

export class UpdateGuardrailEventStatusUseCase {
  constructor(private readonly guardrailEventRepo: GuardrailEventRepository) {}

  async execute(eventId: string, status: string): Promise<string> {
    if (!VALID_STATUSES.includes(status as EventStatus)) {
      throw new ValidationError(`Invalid status: ${status}`)
    }
    await this.guardrailEventRepo.updateStatus(eventId, status as EventStatus)
    return status
  }
}
