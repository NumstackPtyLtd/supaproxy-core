import type { WorkspaceRepository } from '../../domain/workspace/repository.js'
import type { ConversationQueryRepository } from '../../domain/conversation/queryRepository.js'
import type { GuardrailEventRepository, GuardrailEventData, GuardrailEventFilter } from '../../domain/guardrail/repository.js'
import { parseComplianceViolations } from '../../domain/shared/jsonMappers.js'

export class GetComplianceUseCase {
  constructor(
    private readonly workspaceRepo: WorkspaceRepository,
    private readonly conversationQueryRepo: ConversationQueryRepository,
    private readonly guardrailEventRepo?: GuardrailEventRepository,
  ) {}

  async execute(workspaceId: string, eventFilter?: GuardrailEventFilter) {
    const guardrailEventResult = this.guardrailEventRepo && eventFilter
      ? this.guardrailEventRepo.findByWorkspaceFiltered(workspaceId, eventFilter)
      : this.guardrailEventRepo
        ? this.guardrailEventRepo.findByWorkspace(workspaceId, 50).then(events => ({ events, total: events.length }))
        : Promise.resolve({ events: [] as GuardrailEventData[], total: 0 })

    const [guardrails, violationRows, eventResult] = await Promise.all([
      this.workspaceRepo.findGuardrails(workspaceId),
      this.conversationQueryRepo.getComplianceViolationsByWorkspace(workspaceId, 20),
      guardrailEventResult,
    ])

    const violations = violationRows.flatMap(r =>
      parseComplianceViolations(r.compliance_violations).map(v => ({
        ...v, conversation_id: r.conversation_id, user_name: r.user_name, timestamp: r.last_activity_at,
      }))
    )

    return { guardrails, violations, guardrailEvents: eventResult.events, guardrailEventTotal: eventResult.total }
  }
}
