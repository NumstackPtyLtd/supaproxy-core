import type { WorkspaceRepository } from '../../domain/workspace/repository.js'
import type { OrganisationRepository } from '../../domain/organisation/repository.js'
import type { ConversationRepository } from '../../domain/conversation/repository.js'
import type { SessionStore, RoutingSession } from '../ports/SessionStore.js'
import { buildSessionKey } from '../ports/SessionStore.js'
import type { ExecuteQueryUseCase } from '../query/ExecuteQueryUseCase.js'
import type { ManageConversationUseCase } from '../conversation/ManageConversationUseCase.js'
import { ReceptionistPromptBuilder } from './ReceptionistPromptBuilder.js'
import { NotFoundError } from '../../domain/shared/errors.js'
import { SESSION_TTL_SECONDS, CONSUMER_TYPE_SYSTEM } from '../../defaults.js'
import { REDIRECT_INTENT_SYSTEM, buildRedirectIntentPrompt, ROUTING_DIRECTIVE_REGEX, ROUTING_DIRECTIVE_CLEAN_REGEX, formatRoutingIndicator, isRedirectOffer } from '../../prompts.js'
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
  private readonly promptBuilder = new ReceptionistPromptBuilder()

  constructor(
    private readonly workspaceRepo: WorkspaceRepository,
    private readonly orgRepo: OrganisationRepository,
    private readonly conversationRepo: ConversationRepository,
    private readonly sessionStore: SessionStore,
    private readonly executeQueryUseCase: ExecuteQueryUseCase,
    private readonly conversationUseCase: ManageConversationUseCase,
  ) {}

  async execute(input: RouteMessageInput): Promise<RouteMessageOutput> {
    const sessionKey = buildSessionKey(input.consumerType, input.entryPoint, input.userId)

    // Check for an active session
    const existingSession = await this.sessionStore.get(sessionKey)

    if (existingSession) {
      // If session is on the default workspace and hasn't been routed yet,
      // continue using the receptionist (don't bypass routing prompt)
      const defaultWs = await this.workspaceRepo.findDefaultByOrg(input.orgId)
      if (defaultWs && existingSession.workspaceId === defaultWs.id && !existingSession.routedFrom) {
        return this.routeViaReceptionist(input, sessionKey)
      }

      // If the AI previously offered a redirect, ask the receptionist if the user accepted
      if (existingSession.pendingRedirect) {
        log.info({ sessionKey, query: input.query }, 'Pending redirect, checking intent via AI')
        const wantsRedirect = await this.checkRedirectIntent(input.query, input.orgId)
        log.info({ sessionKey, wantsRedirect }, 'Redirect intent result')
        if (wantsRedirect) {
          await this.sessionStore.delete(sessionKey)
          return this.routeViaReceptionist(input, sessionKey)
        }
      }

      // Get prior conversation history for context continuity
      const priorHistory = existingSession.routedFromConversationId
        ? await this.conversationUseCase.getHistory(existingSession.routedFromConversationId)
        : undefined

      // Execute in the current workspace with prior context
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

      // Log to #general master conversation as well
      if (existingSession.generalConversationId) {
        await this.logToGeneral(existingSession.generalConversationId, input.query, result.answer)
      }

      // Update session: set pendingRedirect if scope guardrail triggered, clear otherwise
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

    // No active session: route through #general (receptionist)
    return this.routeViaReceptionist(input, sessionKey)
  }

  private async checkRedirectIntent(query: string, orgId: string): Promise<boolean> {
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

  private async routeViaReceptionist(input: RouteMessageInput, sessionKey: string): Promise<RouteMessageOutput> {
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
      await this.createSession(sessionKey, defaultWs.id, null)

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
        workspaceId: defaultWs.id,
        routed: false,
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

    // Parse routing directive from the response
    const routeMatch = result.answer.match(ROUTING_DIRECTIVE_REGEX)

    if (routeMatch) {
      const targetWorkspaceId = routeMatch[1]
      const routeReason = routeMatch[2]

      // Verify the target workspace exists
      const targetWs = await this.workspaceRepo.findActiveById(targetWorkspaceId)
      if (!targetWs) {
        log.warn({ targetWorkspaceId }, 'Receptionist routed to non-existent workspace, staying in #general')
        await this.createSession(sessionKey, defaultWs.id, null)

        return {
          answer: this.cleanRoutingDirective(result.answer),
          conversationId: result.conversationId,
          workspaceId: defaultWs.id,
          routed: false,
        }
      }

      // Create session pointing to the target workspace
      // Store #general conversation ID so we can log all messages there too
      await this.sessionStore.set(sessionKey, {
        workspaceId: targetWorkspaceId,
        lastMessageAt: Date.now(),
        routedFrom: defaultWs.name,
        routedFromConversationId: result.conversationId,
        generalConversationId: result.conversationId,
      }, SESSION_TTL_SECONDS)

      // Record routing metadata on the conversation
      await this.conversationRepo.updateRouting(
        result.conversationId, defaultWs.name, targetWs.name, routeReason,
      )

      // Clean the routing directive from the visible answer and add routing indicator
      const cleanAnswer = this.cleanRoutingDirective(result.answer)
      const answerWithIndicator = `${cleanAnswer}${formatRoutingIndicator(targetWs.name)}`

      log.info({
        orgId: input.orgId,
        from: defaultWs.id,
        to: targetWorkspaceId,
        reason: routeReason,
      }, 'Message routed')

      return {
        answer: answerWithIndicator,
        conversationId: result.conversationId,
        workspaceId: targetWorkspaceId,
        routed: true,
        routedTo: targetWs.name,
      }
    }

    // No routing directive: receptionist is still talking
    await this.createSession(sessionKey, defaultWs.id, null)

    return {
      answer: result.answer,
      conversationId: result.conversationId,
      workspaceId: defaultWs.id,
      routed: false,
    }
  }

  /** Log messages to the #general master conversation for full audit trail */
  private async logToGeneral(generalConversationId: string, query: string, answer: string): Promise<void> {
    try {
      await this.conversationUseCase.recordMessage(generalConversationId, 'user', query)
      await this.conversationUseCase.recordMessage(generalConversationId, 'assistant', answer)
    } catch (err) {
      log.warn({ error: (err as Error).message }, 'Failed to log to #general conversation')
    }
  }

  private async createSession(key: string, workspaceId: string, routedFrom: string | null): Promise<void> {
    const session: RoutingSession = {
      workspaceId,
      lastMessageAt: Date.now(),
      routedFrom,
    }
    await this.sessionStore.set(key, session, SESSION_TTL_SECONDS)
  }

  private cleanRoutingDirective(answer: string): string {
    return answer.replace(ROUTING_DIRECTIVE_CLEAN_REGEX, '').trim()
  }
}
