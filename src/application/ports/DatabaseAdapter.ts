/**
 * DatabaseAdapter: the contract every database adapter package must implement.
 *
 * To build a custom adapter (e.g. @supaproxy/postgres, @supaproxy/sqlite):
 *
 * 1. Install @supaproxy/core as a peer dependency
 * 2. Import this interface: `import type { DatabaseAdapter } from '@supaproxy/core/ports/database'`
 * 3. Implement every repository listed below
 * 4. Export a factory function that returns a DatabaseAdapter:
 *
 *    export function createPostgresInfra(pool: pg.Pool): DatabaseAdapter {
 *      return {
 *        orgRepo: new PgOrganisationRepository(pool),
 *        workspaceRepo: new PgWorkspaceRepository(pool),
 *        // ... all 11 repositories
 *      }
 *    }
 *
 * 5. Export a `runMigrations(pool)` function that creates all required tables
 *
 * See @supaproxy/mysql for a complete reference implementation.
 */

import type { OrganisationRepository } from '../../domain/organisation/repository.js'
import type { WorkspaceRepository } from '../../domain/workspace/repository.js'
import type { ConversationRepository } from '../../domain/conversation/repository.js'
import type { ConversationQueryRepository } from '../../domain/conversation/queryRepository.js'
import type { AuditLogRepository } from '../../domain/audit/repository.js'
import type { GuardrailEventRepository } from '../../domain/guardrail/repository.js'
import type { GuardrailPolicyRepository } from '../../domain/guardrail/policyRepository.js'
import type { IntegrationRepository, EntryPointRepository } from '../../domain/integration/repository.js'
import type { KnowledgeChunkRepository, KnowledgeGapRepository } from '../../domain/knowledge/repository.js'
import type { PromptTemplateRepository } from '../../domain/prompt/repository.js'
import type { ModelRepository } from './ModelRepository.js'

export interface DatabaseAdapter {
  /** Organisation, user, team, and settings persistence */
  orgRepo: OrganisationRepository

  /** Workspace, connection, consumer, knowledge source, guardrail, and permission persistence */
  workspaceRepo: WorkspaceRepository

  /** Conversation lifecycle, messages, and stats */
  conversationRepo: ConversationRepository

  /** Dashboard and analytics queries (read-only) */
  conversationQueryRepo: ConversationQueryRepository

  /** Audit log creation (append-only query log) */
  auditRepo: AuditLogRepository

  /** AI model listing and defaults */
  modelRepo: ModelRepository

  /** Prompt template versioning and activation */
  promptTemplateRepo: PromptTemplateRepository

  /** Guardrail event creation, filtering, and status management */
  guardrailEventRepo: GuardrailEventRepository

  /** Guardrail policy enforcement, compliance, and security overview */
  guardrailPolicyRepo: GuardrailPolicyRepository

  /** Consumer integration (Slack, WhatsApp, API) management */
  integrationRepo: IntegrationRepository

  /** Entry point (channel routing) management */
  entryPointRepo: EntryPointRepository

  /** Knowledge chunk storage for RAG pipelines */
  knowledgeChunkRepo: KnowledgeChunkRepository

  /** Knowledge gaps captured live when the assistant cannot answer */
  knowledgeGapRepo: KnowledgeGapRepository

  /** Monthly cost for a workspace (sum of audit_logs.cost_usd for current month) */
  getMonthlySpend(workspaceId: string): Promise<number>

  /** Merged guardrail config for a workspace (cost cap, rate limit, blocked topics) */
  getWorkspaceGuardrailConfig(workspaceId: string): Promise<import('../query/PreQueryGuardService.js').GuardrailConfig | null>
}
