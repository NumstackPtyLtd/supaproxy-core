import type { WorkspaceRepository, WorkspaceRoutingSummary } from '../../domain/workspace/repository.js'
import type { OrganisationRepository } from '../../domain/organisation/repository.js'
import type { ExecuteQueryUseCase } from '../query/ExecuteQueryUseCase.js'
import { ReceptionistPromptBuilder } from './ReceptionistPromptBuilder.js'
import { resolveGrounding, buildReceptionistGroundingClause } from '../query/KnowledgeGrounding.js'
import { NotFoundError } from '../../domain/shared/errors.js'
import { CONSUMER_TYPE_SYSTEM } from '../../defaults.js'
import { REDIRECT_INTENT_SYSTEM, buildRedirectIntentPrompt, REROUTE_CLASSIFIER_SYSTEM, buildRerouteClassifierPrompt } from '../../prompts.js'
import pino from 'pino'

const log = pino({ name: 'workspace-matcher' })

export interface MatchRouteInput {
  orgId: string
  query: string
  consumerType: string
  entryPoint: string
  userId: string
  userName?: string
}

export interface ReceptionistResult {
  answer: string
  conversationId: string
  defaultWorkspaceId: string
}

export class WorkspaceMatcher {
  private readonly promptBuilder = new ReceptionistPromptBuilder()

  constructor(
    private readonly workspaceRepo: WorkspaceRepository,
    private readonly orgRepo: OrganisationRepository,
    private readonly executeQueryUseCase: ExecuteQueryUseCase,
  ) {}

  async checkRedirectIntent(query: string, orgId: string): Promise<boolean> {
    try {
      const defaultWs = await this.workspaceRepo.findDefaultByOrg(orgId)
      if (!defaultWs) return false

      const prompt = buildRedirectIntentPrompt(query)
      const result = await this.executeQueryUseCase.execute(defaultWs.id, prompt, {
        consumerType: CONSUMER_TYPE_SYSTEM,
        systemPromptOverride: REDIRECT_INTENT_SYSTEM,
        skipTools: true,
      })
      return result.answer.toLowerCase().trim().startsWith('yes')
    } catch (err) {
      log.warn({ error: (err as Error).message }, 'Redirect intent check failed, defaulting to no')
      return false
    }
  }

  /**
   * For a conversation already in a department, decide whether the latest
   * message belongs to a different department. Returns that department to
   * re-route to, or null to stay. Conservative: only re-routes on a clear
   * match to a different department.
   */
  async checkReroute(orgId: string, query: string, currentWorkspaceId: string): Promise<{ workspaceId: string; name: string } | null> {
    try {
      const defaultWs = await this.workspaceRepo.findDefaultByOrg(orgId)
      if (!defaultWs) return null

      const workspaces = await this.workspaceRepo.listRoutingSummaries(orgId)
      const current = workspaces.find(w => w.id === currentWorkspaceId)
      if (!current || workspaces.length < 2) return null

      const prompt = buildRerouteClassifierPrompt(current.name, query, workspaces)
      const result = await this.executeQueryUseCase.execute(defaultWs.id, prompt, {
        consumerType: CONSUMER_TYPE_SYSTEM,
        systemPromptOverride: REROUTE_CLASSIFIER_SYSTEM,
        skipTools: true,
      })

      const reply = result.answer.trim().toLowerCase()
      if (!reply || reply.includes('current')) return null
      const target = workspaces.find(w => w.id !== currentWorkspaceId && reply.includes(w.name.toLowerCase()))
      return target ? { workspaceId: target.id, name: target.name } : null
    } catch (err) {
      log.warn({ error: (err as Error).message }, 'Re-route check failed, staying in current workspace')
      return null
    }
  }

  async runReceptionist(input: MatchRouteInput, sessionKey: string): Promise<ReceptionistResult & { workspaces: WorkspaceRoutingSummary[] }> {
    const defaultWs = await this.workspaceRepo.findDefaultByOrg(input.orgId)
    if (!defaultWs) {
      throw new NotFoundError('Default workspace', input.orgId)
    }

    const org = await this.orgRepo.findById(input.orgId)
    if (!org) {
      throw new NotFoundError('Organisation', input.orgId)
    }

    const workspaces = await this.workspaceRepo.listRoutingSummaries(input.orgId)

    // If there's only #general (no specialised workspaces), route directly there
    if (workspaces.length === 0) {
      const result = await this.executeQueryUseCase.execute(defaultWs.id, input.query, {
        consumerType: input.consumerType,
        channel: input.entryPoint,
        userId: input.userId,
        userName: input.userName,
        sessionId: sessionKey,
      })

      return {
        answer: result.answer,
        conversationId: result.conversationId,
        defaultWorkspaceId: defaultWs.id,
        workspaces: [],
      }
    }

    // Build receptionist prompt and run through #general with no tools. The
    // front desk has no knowledge base, so it carries the resolved grounding
    // level directly to keep it from inventing product specifics.
    const groundingSettings = await this.orgRepo.getSettingValues(['knowledge_grounding'])
    const grounding = resolveGrounding(defaultWs.knowledge_grounding, groundingSettings['knowledge_grounding'])
    const systemPrompt = this.promptBuilder.build(org.name, workspaces, buildReceptionistGroundingClause(grounding))

    const result = await this.executeQueryUseCase.execute(defaultWs.id, input.query, {
      consumerType: input.consumerType,
      channel: input.entryPoint,
      userId: input.userId,
      userName: input.userName,
      sessionId: sessionKey,
      systemPromptOverride: systemPrompt,
      skipTools: true,
    })

    return {
      answer: result.answer,
      conversationId: result.conversationId,
      defaultWorkspaceId: defaultWs.id,
      workspaces,
    }
  }
}
