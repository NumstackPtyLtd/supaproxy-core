import type { GuardrailPlugin } from '@supaproxy/guardrails'
import { runGuardrailChain } from '../ports/guardrailChain.js'
import pino from 'pino'

const log = pino({ name: 'output-screener' })

export interface OutputScreeningContext {
  workspaceId: string
  userId?: string
  consumerType: string
}

export interface OutputScreeningOutcome {
  blocked: boolean
  answer: string
  reason?: string
  annotations: string[] | null
  durationMs: number | null
}

/**
 * Runs post-LLM guardrails over a generated answer. Post-LLM guards (such as
 * the grounding guard) receive the grounding level and knowledge context via
 * metadata. A blocking guard replaces the answer with its reason; a guard that
 * only modifies the answer passes the modified text through.
 */
export async function screenOutput(
  guardrails: GuardrailPlugin[],
  answer: string,
  ctx: OutputScreeningContext,
  metadata: Record<string, unknown>,
): Promise<OutputScreeningOutcome> {
  if (guardrails.length === 0) {
    return { blocked: false, answer, annotations: null, durationMs: null }
  }

  const start = Date.now()
  const chain = await runGuardrailChain(
    guardrails,
    answer,
    { workspaceId: ctx.workspaceId, userId: ctx.userId, consumerType: ctx.consumerType },
    metadata,
  )
  const durationMs = Date.now() - start
  const annotations = chain.annotations.length > 0 ? chain.annotations : null

  if (chain.blocked) {
    log.info({ workspace: ctx.workspaceId, annotations: chain.annotations }, 'Answer blocked by post-LLM guardrail')
    return {
      blocked: true,
      answer: chain.reason || 'This answer was withheld by a grounding policy.',
      reason: chain.reason,
      annotations,
      durationMs,
    }
  }

  return { blocked: false, answer: chain.query, annotations, durationMs }
}
