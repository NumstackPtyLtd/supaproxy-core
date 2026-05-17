import type { WorkspaceRepository, WorkspaceRoutingSummary } from '../../domain/workspace/repository.js'
import type { OrganisationRepository } from '../../domain/organisation/repository.js'
import type { ExecuteQueryUseCase } from '../query/ExecuteQueryUseCase.js'
import { ReceptionistPromptBuilder } from './ReceptionistPromptBuilder.js'
import { NotFoundError } from '../../domain/shared/errors.js'
import { CONSUMER_TYPE_SYSTEM } from '../../defaults.js'
import { REDIRECT_INTENT_SYSTEM, buildRedirectIntentPrompt } from '../../prompts.js'
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

    // Build receptionist prompt and run through #general with no tools
    const systemPrompt = this.promptBuilder.build(org.name, workspaces)

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
