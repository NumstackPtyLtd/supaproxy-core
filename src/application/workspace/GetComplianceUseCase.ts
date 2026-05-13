import type { WorkspaceRepository } from '../../domain/workspace/repository.js'
import type { ConversationRepository } from '../../domain/conversation/repository.js'
import type { GuardrailEventRepository, GuardrailEventData } from '../../domain/guardrail/repository.js'
import { safeJsonParse } from '../../shared/json.js'

interface ViolationItem { rule: string; description: string }

export class GetComplianceUseCase {
  constructor(
    private readonly workspaceRepo: WorkspaceRepository,
    private readonly conversationRepo: ConversationRepository,
    private readonly guardrailEventRepo?: GuardrailEventRepository,
  ) {}

  async execute(workspaceId: string) {
    const [guardrails, violationRows, guardrailEvents] = await Promise.all([
      this.workspaceRepo.findGuardrails(workspaceId),
      this.conversationRepo.getComplianceViolationsByWorkspace(workspaceId, 20),
      this.guardrailEventRepo ? this.guardrailEventRepo.findByWorkspace(workspaceId, 50) : Promise.resolve([] as GuardrailEventData[]),
    ])

    const violations: Array<ViolationItem & { conversation_id: string; user_name: string | null; timestamp: string | null }> = []
    for (const r of violationRows) {
      const parsed: ViolationItem[] = typeof r.compliance_violations === 'string' ? safeJsonParse<ViolationItem[]>(r.compliance_violations, []) : (r.compliance_violations || [])
      for (const v of parsed) {
        violations.push({ ...v, conversation_id: r.conversation_id, user_name: r.user_name, timestamp: r.last_activity_at })
      }
    }

    return { guardrails, violations, guardrailEvents }
  }
}
