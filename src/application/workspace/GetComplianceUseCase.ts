import type { WorkspaceRepository } from '../../domain/workspace/repository.js'
import type { ConversationRepository } from '../../domain/conversation/repository.js'
import type { GuardrailEventRepository, GuardrailEventData, GuardrailEventFilter } from '../../domain/guardrail/repository.js'
import { safeJsonParse } from '../../shared/json.js'

interface ViolationItem { rule: string; description: string }

export class GetComplianceUseCase {
  constructor(
    private readonly workspaceRepo: WorkspaceRepository,
    private readonly conversationRepo: ConversationRepository,
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
      this.conversationRepo.getComplianceViolationsByWorkspace(workspaceId, 20),
      guardrailEventResult,
    ])

    const violations: Array<ViolationItem & { conversation_id: string; user_name: string | null; timestamp: string | null }> = []
    for (const r of violationRows) {
      const parsed: ViolationItem[] = typeof r.compliance_violations === 'string' ? safeJsonParse<ViolationItem[]>(r.compliance_violations, []) : (r.compliance_violations || [])
      for (const v of parsed) {
        violations.push({ ...v, conversation_id: r.conversation_id, user_name: r.user_name, timestamp: r.last_activity_at })
      }
    }

    return { guardrails, violations, guardrailEvents: eventResult.events, guardrailEventTotal: eventResult.total }
  }
}
