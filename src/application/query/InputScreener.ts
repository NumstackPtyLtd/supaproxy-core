import type { GuardrailPlugin } from '@supaproxy/guardrails'
import { runGuardrailChain } from '../ports/guardrailChain.js'
import pino from 'pino'

const log = pino({ name: 'input-screener' })

export interface ScreeningContext {
  workspaceId: string
  userId?: string
  consumerType: string
}

export interface ScreeningOutcome {
  blocked: boolean
  reason?: string
  action: string | null
  categories: string[] | null
  durationMs: number | null
  queryToForward: string
}

export async function screenInput(
  guardrails: GuardrailPlugin[],
  query: string,
  ctx: ScreeningContext,
): Promise<ScreeningOutcome> {
  if (guardrails.length === 0) {
    return { blocked: false, action: null, categories: null, durationMs: null, queryToForward: query }
  }

  const screenStart = Date.now()
  const chain = await runGuardrailChain(guardrails, query, {
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    consumerType: ctx.consumerType,
  })
  const durationMs = Date.now() - screenStart
  const categories = chain.annotations.length > 0 ? chain.annotations : null

  if (chain.blocked) {
    log.info({ workspace: ctx.workspaceId, annotations: chain.annotations }, 'Query blocked by guardrail')
    return {
      blocked: true,
      reason: chain.reason || "This query was blocked by your organisation's input policy.",
      action: 'block',
      categories,
      durationMs,
      queryToForward: query,
    }
  }

  let action: string | null = null
  let queryToForward = query
  if (chain.query !== query) {
    action = 'modified'
    queryToForward = chain.query
    log.info({ workspace: ctx.workspaceId, annotations: chain.annotations }, 'Query modified by guardrail')
  }

  return { blocked: false, action, categories, durationMs, queryToForward }
}
