import type { WorkspaceRepository } from '../../domain/workspace/repository.js'
import type { OrganisationRepository } from '../../domain/organisation/repository.js'
import type { ConversationRepository } from '../../domain/conversation/repository.js'
import type { SessionStore, RoutingSession } from '../ports/SessionStore.js'
import { buildSessionKey } from '../ports/SessionStore.js'
import type { ExecuteQueryUseCase } from '../query/ExecuteQueryUseCase.js'
import { ReceptionistPromptBuilder } from './ReceptionistPromptBuilder.js'
import { NotFoundError } from '../../domain/shared/errors.js'
import pino from 'pino'

const log = pino({ name: 'route-message' })

const SESSION_TTL_SECONDS = 1800 // 30 minutes

const REDIRECT_INTENT_PROMPT = `The user was asked: "Would you like me to redirect you to someone who can help?" They responded: "{{query}}" — do they want to be redirected?`

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
  ) {}

  async execute(input: RouteMessageInput): Promise<RouteMessageOutput> {
    const sessionKey = buildSessionKey(input.consumerType, input.entryPoint, input.userId)

    // Check for an active session
    const existingSession = await this.sessionStore.get(sessionKey)

    if (existingSession) {
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

      // Execute in the current workspace
      const result = await this.executeQueryUseCase.execute(existingSession.workspaceId, input.query, {
        consumerType: input.consumerType,
        channel: input.entryPoint,
        userId: input.userId,
        userName: input.userName,
      })

      // Update session: set pendingRedirect if scope guardrail triggered, clear otherwise
      const redirectOffered = this.isRedirectOffer(result.answer)
      await this.sessionStore.set(sessionKey, {
        workspaceId: existingSession.workspaceId,
        lastMessageAt: Date.now(),
        routedFrom: existingSession.routedFrom,
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

      const prompt = REDIRECT_INTENT_PROMPT.replace('{{query}}', query)
      const result = await this.executeQueryUseCase.execute(defaultWs.id, prompt, {
        consumerType: 'system',
        systemPromptOverride: 'You are a redirect intent classifier. Answer only "yes" or "no".',
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
      systemPromptOverride: systemPrompt,
      skipTools: true,
    })

    // Parse routing directive from the response
    const routeMatch = result.answer.match(/<!-- ROUTE:([^:]+):(.+?) -->/)

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
      await this.createSession(sessionKey, targetWorkspaceId, defaultWs.id)

      // Record routing metadata on the conversation
      await this.conversationRepo.updateRouting(
        result.conversationId, defaultWs.id, targetWorkspaceId, routeReason,
      )

      // Clean the routing directive from the visible answer and add routing indicator
      const cleanAnswer = this.cleanRoutingDirective(result.answer)
      const answerWithIndicator = `${cleanAnswer}\n[Routed to ${targetWs.name}]`

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

    // No routing directive: receptionist is still talking (asking clarifying question or out-of-scope)
    // Keep session on #general so the next message continues the receptionist conversation
    await this.createSession(sessionKey, defaultWs.id, null)

    return {
      answer: result.answer,
      conversationId: result.conversationId,
      workspaceId: defaultWs.id,
      routed: false,
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
    return answer.replace(/\s*<!-- ROUTE:[^>]+ -->\s*/g, '').trim()
  }

  private isRedirectOffer(answer: string): boolean {
    const lower = answer.toLowerCase()
    return lower.includes('redirect you') || lower.includes('outside what i can help')
  }
}
