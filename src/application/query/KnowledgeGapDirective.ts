import { safeJsonParse } from '../../shared/json.js'
import { normaliseKnowledgeGap, type KnowledgeGap } from '../../domain/shared/jsonMappers.js'

const GAP_DIRECTIVE_REGEX = /<!--\s*KNOWLEDGE_GAP:\s*([\s\S]*?)\s*-->/
const GAP_DIRECTIVE_CLEAN_REGEX = /\s*<!--\s*KNOWLEDGE_GAP:[\s\S]*?-->\s*/g

/**
 * Parses a live knowledge-gap directive emitted by the model when it cannot
 * answer from the knowledge base. The directive carries the structured gap as
 * JSON: `<!-- KNOWLEDGE_GAP: { ... } -->`. Returns the normalised gap (or null
 * when absent or malformed) and the answer with the directive stripped out.
 */
export function extractKnowledgeGap(answer: string): { gap: KnowledgeGap | null; cleanedAnswer: string } {
  const match = answer.match(GAP_DIRECTIVE_REGEX)
  const cleanedAnswer = answer.replace(GAP_DIRECTIVE_CLEAN_REGEX, ' ').trim()
  if (!match) return { gap: null, cleanedAnswer: answer }

  const parsed = safeJsonParse<unknown>(match[1], null)
  if (parsed === null || typeof parsed !== 'object') return { gap: null, cleanedAnswer }
  return { gap: normaliseKnowledgeGap(parsed), cleanedAnswer }
}
