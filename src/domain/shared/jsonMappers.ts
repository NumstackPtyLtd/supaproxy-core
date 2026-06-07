import { safeJsonParse } from '../../shared/json.js'

export interface ComplianceViolation {
  rule: string
  description: string
}

export interface KnowledgeGap {
  /** What the user was asking about. */
  topic: string
  /** The specific information the assistant needed but could not find. */
  missing_information: string
  /** Where the assistant looked, by name (knowledge sources or tools). */
  sources_checked: string[]
  /** What is absent from the knowledge base, phrased for an admin. */
  gap_detail: string
}

export function parseComplianceViolations(raw: string | null): ComplianceViolation[] {
  if (!raw) return []
  if (typeof raw === 'string') return safeJsonParse<ComplianceViolation[]>(raw, [])
  return raw as ComplianceViolation[]
}

/**
 * Coerces a parsed gap of unknown shape into the structured payload so every
 * model and every stored record exposes the same fields. Falls back to the
 * legacy `description` field for `missing_information`.
 */
export function normaliseKnowledgeGap(raw: unknown): KnowledgeGap {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const str = (v: unknown): string => (typeof v === 'string' ? v : '')
  return {
    topic: str(r.topic) || 'Unspecified topic',
    missing_information: str(r.missing_information) || str(r.description),
    sources_checked: Array.isArray(r.sources_checked) ? r.sources_checked.filter((s): s is string => typeof s === 'string') : [],
    gap_detail: str(r.gap_detail),
  }
}

export function parseKnowledgeGaps(raw: string | null): KnowledgeGap[] {
  if (!raw) return []
  const list = typeof raw === 'string' ? safeJsonParse<unknown[]>(raw, []) : (raw as unknown[])
  return Array.isArray(list) ? list.map(normaliseKnowledgeGap) : []
}

export interface StatsAnalysis {
  sentiment_score: number
  resolution_status: string
  summary: string
  category: string
  compliance_violations: unknown[]
  knowledge_gaps: unknown[]
  fraud_indicators: unknown[]
  tools_used: unknown[]
}

const DEFAULT_ANALYSIS: StatsAnalysis = {
  sentiment_score: 3,
  resolution_status: 'unresolved',
  summary: '',
  category: 'other',
  compliance_violations: [],
  knowledge_gaps: [],
  fraud_indicators: [],
  tools_used: [],
}

export function parseStatsAnalysis(text: string): StatsAnalysis {
  let cleaned = text.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim()
  }
  try {
    return { ...DEFAULT_ANALYSIS, ...JSON.parse(cleaned) }
  } catch {
    return DEFAULT_ANALYSIS
  }
}
