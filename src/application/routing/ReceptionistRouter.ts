import type { WorkspaceRepository } from '../../domain/workspace/repository.js'
import type { ConversationRepository } from '../../domain/conversation/repository.js'
import type { SessionStore, RoutingSession } from '../ports/SessionStore.js'
import type { ManageConversationUseCase } from '../conversation/ManageConversationUseCase.js'
import { WorkspaceMatcher } from './WorkspaceMatcher.js'
import { SESSION_TTL_SECONDS } from '../../defaults.js'
import { ROUTING_DIRECTIVE_REGEX, ROUTING_DIRECTIVE_CLEAN_REGEX, formatRoutingIndicator } from '../../prompts.js'
import pino from 'pino'

const log = pino({ name: 'receptionist-router' })

export interface ReceptionistInput {
  orgId: string
  query: string
  consumerType: string
  entryPoint: string
  userId: string
  userName?: string
}

export interface ReceptionistOutput {
  answer: string
  conversationId: string
  workspaceId: string
  routed: boolean
  routedTo?: string
}

export class ReceptionistRouter {
  constructor(
    private readonly workspaceRepo: WorkspaceRepository,
    private readonly conversationRepo: ConversationRepository,
    private readonly sessionStore: SessionStore,
    private readonly conversationUseCase: ManageConversationUseCase,
    private readonly matcher: WorkspaceMatcher,
  ) {}

  async route(input: ReceptionistInput, sessionKey: string): Promise<ReceptionistOutput> {
    const receptionistResult = await this.matcher.runReceptionist(input, sessionKey)

    if (receptionistResult.workspaces.length === 0) {
      await this.createSession(sessionKey, receptionistResult.defaultWorkspaceId, null)
      return {
        answer: receptionistResult.answer,
        conversationId: receptionistResult.conversationId,
        workspaceId: receptionistResult.defaultWorkspaceId,
        routed: false,
      }
    }

    const routeMatch = receptionistResult.answer.match(ROUTING_DIRECTIVE_REGEX)

    if (routeMatch) {
      return this.handleRouteMatch(routeMatch, receptionistResult, input, sessionKey)
    }

    await this.createSession(sessionKey, receptionistResult.defaultWorkspaceId, null)
    return {
      answer: receptionistResult.answer,
      conversationId: receptionistResult.conversationId,
      workspaceId: receptionistResult.defaultWorkspaceId,
      routed: false,
    }
  }

  private async handleRouteMatch(
    routeMatch: RegExpMatchArray,
    receptionistResult: { answer: string; conversationId: string; defaultWorkspaceId: string },
    input: ReceptionistInput,
    sessionKey: string,
  ): Promise<ReceptionistOutput> {
    const targetWorkspaceId = routeMatch[1]
    const routeReason = routeMatch[2]

    const targetWs = await this.workspaceRepo.findActiveById(targetWorkspaceId)
    if (!targetWs) {
      log.warn({ targetWorkspaceId }, 'Receptionist routed to non-existent workspace, staying in #general')
      await this.createSession(sessionKey, receptionistResult.defaultWorkspaceId, null)
      return {
        answer: cleanRoutingDirective(receptionistResult.answer),
        conversationId: receptionistResult.conversationId,
        workspaceId: receptionistResult.defaultWorkspaceId,
        routed: false,
      }
    }

    const defaultWs = await this.workspaceRepo.findDefaultByOrg(input.orgId)
    await this.sessionStore.set(sessionKey, {
      workspaceId: targetWorkspaceId,
      lastMessageAt: Date.now(),
      routedFrom: defaultWs?.name || null,
      routedFromConversationId: receptionistResult.conversationId,
      generalConversationId: receptionistResult.conversationId,
    }, SESSION_TTL_SECONDS)

    await this.conversationRepo.updateRouting(
      receptionistResult.conversationId, defaultWs?.name || '', targetWs.name, routeReason,
    )

    const cleanAnswer = cleanRoutingDirective(receptionistResult.answer)
    const answerWithIndicator = `${cleanAnswer}${formatRoutingIndicator(targetWs.name)}`

    log.info({ orgId: input.orgId, from: receptionistResult.defaultWorkspaceId, to: targetWorkspaceId, reason: routeReason }, 'Message routed')

    return {
      answer: answerWithIndicator,
      conversationId: receptionistResult.conversationId,
      workspaceId: targetWorkspaceId,
      routed: true,
      routedTo: targetWs.name,
    }
  }

  async logToGeneral(generalConversationId: string, query: string, answer: string): Promise<void> {
    try {
      await this.conversationUseCase.recordMessage(generalConversationId, 'user', query)
      await this.conversationUseCase.recordMessage(generalConversationId, 'assistant', answer)
    } catch (err) {
      log.warn({ error: (err as Error).message }, 'Failed to log to #general conversation')
    }
  }

  private async createSession(key: string, workspaceId: string, routedFrom: string | null): Promise<void> {
    const session: RoutingSession = { workspaceId, lastMessageAt: Date.now(), routedFrom }
    await this.sessionStore.set(key, session, SESSION_TTL_SECONDS)
  }
}

export function cleanRoutingDirective(answer: string): string {
  return answer.replace(ROUTING_DIRECTIVE_CLEAN_REGEX, '').trim()
}
