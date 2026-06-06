/**
 * How much the model may augment beyond the workspace knowledge base.
 *
 * - strict:   answer only from the knowledge base and tool results; decline
 *             anything ungoverned. No general knowledge at all.
 * - grounded: answer from the knowledge base and tools; may phrase and explain
 *             freely, but must never introduce facts, figures, amounts,
 *             currencies, names, or dates that are not present in the knowledge
 *             base or a tool result.
 * - open:     the knowledge base informs the answer; the model may augment
 *             freely with general knowledge.
 */
export type KnowledgeGrounding = 'strict' | 'grounded' | 'open'

export const DEFAULT_KNOWLEDGE_GROUNDING: KnowledgeGrounding = 'grounded'

export function normaliseGrounding(value: string | null | undefined): KnowledgeGrounding | null {
  return value === 'strict' || value === 'grounded' || value === 'open' ? value : null
}

/** Workspace override wins over the org default, which wins over the system default. */
export function resolveGrounding(
  workspaceLevel: string | null | undefined,
  orgDefault: string | null | undefined,
): KnowledgeGrounding {
  return normaliseGrounding(workspaceLevel) ?? normaliseGrounding(orgDefault) ?? DEFAULT_KNOWLEDGE_GROUNDING
}

/**
 * The instruction added to the system prompt telling the model how it may use
 * the knowledge base. Returns '' for the open level when no knowledge was
 * retrieved (nothing to govern).
 */
export function buildGroundingClause(grounding: KnowledgeGrounding, chunkCount: number): string {
  switch (grounding) {
    case 'strict':
      return '<knowledge_grounding level="strict">\nYou may use ONLY information from the workspace knowledge base and from tool results in this conversation. This rule overrides your role description and any instinct to be helpful with general knowledge. Never state any fact, figure, amount, currency, rate, name, product detail, or date that is not explicitly present in the knowledge base or a tool result. This includes broad questions: do not list, describe, or summarise products, services, amount ranges, eligibility, or processes unless those specifics appear in the knowledge base or a tool result. If the knowledge base does not cover the question (including when no knowledge is provided below), do not answer from general knowledge: say you do not have governance covering that and offer to route or escalate.\n</knowledge_grounding>'
    case 'grounded':
      return '<knowledge_grounding level="grounded">\nEvery factual claim in your answer must come from the workspace knowledge base or a tool result. This overrides any instinct to fill gaps with general knowledge. You may rephrase and explain for clarity, but never state any fact, figure, amount, currency, rate, name, product detail, or date that is not explicitly present in the knowledge base or a tool result. If the knowledge base does not cover something, say so rather than guessing.\n</knowledge_grounding>'
    case 'open':
      return chunkCount > 0
        ? '<knowledge_grounding level="open">\nUse the workspace knowledge base to inform your response where relevant.\n</knowledge_grounding>'
        : ''
  }
}

/**
 * Grounding instruction for the receptionist front desk, which routes rather
 * than answers and has no knowledge base of its own. Under strict or grounded
 * it must never invent product specifics; under open it behaves as before.
 */
export function buildReceptionistGroundingClause(grounding: KnowledgeGrounding): string {
  if (grounding === 'open') return ''
  return 'Grounding: never invent or state product specifics, figures, amounts, currencies, rates, names, or terms. If a department covers the request, route to it; if none does, say you do not have that information rather than guessing.'
}
