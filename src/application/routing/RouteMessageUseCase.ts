import type { WorkspaceRepository } from '../../domain/workspace/repository.js'
import type { OrganisationRepository } from '../../domain/organisation/repository.js'
import type { ConversationRepository } from '../../domain/conversation/repository.js'
import type { SessionStore } from '../ports/SessionStore.js'
import { buildSessionKey } from '../ports/SessionStore.js'
import type { ExecuteQueryUseCase } from '../query/ExecuteQueryUseCase.js'
import type { ManageConversationUseCase } from '../conversation/ManageConversationUseCase.js'
import { WorkspaceMatcher } from './WorkspaceMatcher.js'
import { ReceptionistRouter } from './ReceptionistRouter.js'
import { SESSION_TTL_SECONDS } from '../../defaults.js'
import { isRedirectOffer } from '../../prompts.js'
import pino from 'pino'

const log = pino({ name: 'route-message' })

interface RouteMessageInput {
  orgId: string
  query: string
  consumerType: string
  entryPoint: string
  userId: string
  userName?: string
}

interface RouteMessageOutput {
  answer: string
  conversationId: string
  workspaceId: string
  routed: boolean
  routedTo?: string
}

export class RouteMessageUseCase {
  private readonly matcher: WorkspaceMatcher
  private readonly router: ReceptionistRouter

  constructor(
    private readonly workspaceRepo: WorkspaceRepository,
    private readonly orgRepo: OrganisationRepository,
    private readonly conversationRepo: ConversationRepository,
    private readonly sessionStore: SessionStore,
    private readonly executeQueryUseCase: ExecuteQueryUseCase,
    private readonly conversationUseCase: ManageConversationUseCase,
  ) {
    this.matcher = new WorkspaceMatcher(workspaceRepo, orgRepo, executeQueryUseCase)
    this.router = new ReceptionistRouter(workspaceRepo, conversationRepo, sessionStore, conversationUseCase, this.matcher)
  }

  async execute(input: RouteMessageInput): Promise<RouteMessageOutput> {
    const sessionKey = buildSessionKey(input.consumerType, input.entryPoint, input.userId)
    const existingSession = await this.sessionStore.get(sessionKey)

    if (existingSession) {
      return this.handleExistingSession(input, sessionKey, existingSession)
    }

    return this.router.route(input, sessionKey)
  }

  private async handleExistingSession(
    input: RouteMessageInput,
    sessionKey: string,
    existingSession: { workspaceId: string; routedFrom?: string | null; routedFromConversationId?: string | null; generalConversationId?: string | null; pendingRedirect?: boolean },
  ): Promise<RouteMessageOutput> {
    const defaultWs = await this.workspaceRepo.findDefaultByOrg(input.orgId)
    if (defaultWs && existingSession.workspaceId === defaultWs.id && !existingSession.routedFrom) {
      return this.router.route(input, sessionKey)
    }

    if (existingSession.pendingRedirect) {
      log.info({ sessionKey, query: input.query }, 'Pending redirect, checking intent via AI')
      const wantsRedirect = await this.matcher.checkRedirectIntent(input.query, input.orgId)
      log.info({ sessionKey, wantsRedirect }, 'Redirect intent result')
      if (wantsRedirect) {
        await this.sessionStore.delete(sessionKey)
        return this.router.route(input, sessionKey)
      }
    }

    const priorHistory = existingSession.routedFromConversationId
      ? await this.conversationUseCase.getHistory(existingSession.routedFromConversationId)
      : undefined

    const result = await this.executeQueryUseCase.execute(existingSession.workspaceId, input.query, {
      consumerType: input.consumerType,
      channel: input.entryPoint,
      userId: input.userId,
      userName: input.userName,
      sessionId: sessionKey,
      routedFrom: existingSession.routedFrom || undefined,
      routedFromConversationId: existingSession.routedFromConversationId || undefined,
      priorHistory,
    })

    if (existingSession.generalConversationId) {
      await this.router.logToGeneral(existingSession.generalConversationId, input.query, result.answer)
    }

    const redirectOffered = isRedirectOffer(result.answer)
    await this.sessionStore.set(sessionKey, {
      workspaceId: existingSession.workspaceId,
      lastMessageAt: Date.now(),
      routedFrom: existingSession.routedFrom,
      routedFromConversationId: existingSession.routedFromConversationId,
      generalConversationId: existingSession.generalConversationId,
      pendingRedirect: redirectOffered,
    }, SESSION_TTL_SECONDS)

    return {
      answer: result.answer,
      conversationId: result.conversationId,
      workspaceId: existingSession.workspaceId,
      routed: false,
    }
  }
}
