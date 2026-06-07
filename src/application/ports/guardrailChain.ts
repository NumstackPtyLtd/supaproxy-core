import type { GuardrailPlugin, GuardrailContext, GuardrailOutput } from '@supaproxy/guardrails'

export interface ChainResult {
  blocked: boolean
  query: string
  original: string
  reason?: string
  annotations: string[]
  metadata: Record<string, unknown>
  filterCount: number
}

/**
 * Runs multiple guardrails in sequence as middleware.
 * Each filter receives the output of the previous one.
 * First 'block' stops the chain.
 * Modifications accumulate through the pipeline.
 */
export async function runGuardrailChain(
  guardrails: GuardrailPlugin[],
  query: string,
  context: GuardrailContext,
): Promise<ChainResult> {
  let currentQuery = query
  const allAnnotations: string[] = []
  let metadata: Record<string, unknown> = {}

  for (const guardrail of guardrails) {
    const output: GuardrailOutput = await guardrail.process({
      query: currentQuery,
      original: query,
      context,
      metadata,
    })

    if (output.annotations) {
      allAnnotations.push(...output.annotations)
    }

    if (output.metadata) {
      metadata = { ...metadata, ...output.metadata }
    }

    if (output.action === 'block') {
      return {
        blocked: true,
        query: currentQuery,
        original: query,
        reason: output.reason,
        annotations: allAnnotations,
        metadata,
        filterCount: guardrails.length,
      }
    }

    if (output.query) {
      currentQuery = output.query
    }
  }

  return {
    blocked: false,
    query: currentQuery,
    original: query,
    annotations: allAnnotations,
    metadata,
    filterCount: guardrails.length,
  }
}
