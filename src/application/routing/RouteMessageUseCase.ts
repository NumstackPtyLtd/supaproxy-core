import type { WorkspaceRepository } from '../../domain/workspace/repository.js'
import type { SessionStore, RoutingSession } from '../ports/SessionStore.js'
import { buildSessionKey } from '../ports/SessionStore.js'
import type { ExecuteQueryUseCase } from '../query/ExecuteQueryUseCase.js'
import type { ManageConversationUseCase } from '../conversation/ManageConversationUseCase.js'
import type { WorkspaceMatcher } from './WorkspaceMatcher.js'
import type { ReceptionistRouter } from './ReceptionistRouter.js'
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

export interface ScopeChange {
  currentWorkspace: string
  currentWorkspaceId: string
}

interface RouteMessageOutput {
  answer: string
  conversationId: string
  workspaceId: string
  routed: boolean
  routedTo?: string
  scopeChange?: ScopeChange
}

export class RouteMessageUseCase {
  constructor(
    private readonly workspaceRepo: WorkspaceRepository,
    private readonly sessionStore: SessionStore,
    private readonly executeQueryUseCase: ExecuteQueryUseCase,
    private readonly conversationUseCase: ManageConversationUseCase,
    private readonly matcher: WorkspaceMatcher,
    private readonly router: ReceptionistRouter,
  ) {}

  async execute(input: RouteMessageInput): Promise<RouteMessageOutput> {
    const sessionKey = buildSessionKey(input.consumerType, input.entryPoint, input.userId)
    const existingSession = await this.sessionStore.get(sessionKey)

    if (existingSession) {
      return this.handleExistingSession(input, sessionKey, existingSession)
    }

    const routed = await this.router.route(input, sessionKey)
    if (!routed.routed) {
      return { answer: routed.answer, conversationId: routed.conversationId, workspaceId: routed.workspaceId, routed: false }
    }

    // Routed: answer the query immediately in the target workspace, carrying
    // the receptionist (#general) history so it has the scope from reception.
    const session = await this.sessionStore.get(sessionKey)
    const result = await this.executeInWorkspace(routed.workspaceId, input, sessionKey, session)
    return {
      answer: result.answer,
      conversationId: result.conversationId,
      workspaceId: routed.workspaceId,
      routed: true,
      routedTo: routed.routedTo,
    }
  }

  // Execute the query in a workspace, carrying any routed-from history, and
  // mirror the exchange to the #general master conversation.
  private async executeInWorkspace(
    workspaceId: string,
    input: RouteMessageInput,
    sessionKey: string,
    session: RoutingSession | null,
  ): Promise<{ answer: string; conversationId: string }> {
    const priorHistory = session?.routedFromConversationId
      ? await this.conversationUseCase.getHistory(session.routedFromConversationId)
      : undefined
    const result = await this.executeQueryUseCase.execute(workspaceId, input.query, {
      consumerType: input.consumerType,
      channel: input.entryPoint,
      userId: input.userId,
      userName: input.userName,
      sessionId: sessionKey,
      routedFrom: session?.routedFrom || undefined,
      routedFromConversationId: session?.routedFromConversationId || undefined,
      priorHistory,
    })
    if (session?.generalConversationId) {
      await this.router.logToGeneral(session.generalConversationId, input.query, result.answer)
    }
    return { answer: result.answer, conversationId: result.conversationId }
  }

  private async handleExistingSession(
    input: RouteMessageInput,
    sessionKey: string,
    existingSession: RoutingSession,
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

    const result = await this.executeInWorkspace(existingSession.workspaceId, input, sessionKey, existingSession)

    const outOfScope = existingSession.routedFrom && isRedirectOffer(result.answer)
    const redirectOffered = isRedirectOffer(result.answer)

    // Emit scope change event instead of auto-re-routing
    let scopeChange: ScopeChange | undefined
    if (outOfScope) {
      const ws = await this.workspaceRepo.findActiveById(existingSession.workspaceId)
      const wsName = ws?.name || existingSession.workspaceId
      scopeChange = { currentWorkspace: wsName, currentWorkspaceId: existingSession.workspaceId }
      log.info({ sessionKey, workspace: existingSession.workspaceId }, 'Scope change: query outside current workspace')
    }

    await this.sessionStore.set(sessionKey, {
      workspaceId: existingSession.workspaceId,
      lastMessageAt: Date.now(),
      routedFrom: existingSession.routedFrom,
      routedFromConversationId: existingSession.routedFromConversationId,
      generalConversationId: existingSession.generalConversationId,
      pendingRedirect: redirectOffered,
    }, SESSION_TTL_SECONDS)

    return {
      answer: outOfScope
        ? `That's outside the scope of ${scopeChange!.currentWorkspace}. Would you like me to connect you with the right department?`
        : result.answer,
      conversationId: result.conversationId,
      workspaceId: existingSession.workspaceId,
      routed: false,
      scopeChange,
    }
  }
}
