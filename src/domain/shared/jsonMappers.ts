import { safeJsonParse } from '../../shared/json.js'

export interface ComplianceViolation {
  rule: string
  description: string
}

export interface KnowledgeGap {
  topic: string
  [key: string]: unknown
}

export function parseComplianceViolations(raw: string | null): ComplianceViolation[] {
  if (!raw) return []
  if (typeof raw === 'string') return safeJsonParse<ComplianceViolation[]>(raw, [])
  return raw as ComplianceViolation[]
}

export function parseKnowledgeGaps(raw: string | null): KnowledgeGap[] {
  if (!raw) return []
  if (typeof raw === 'string') return safeJsonParse<KnowledgeGap[]>(raw, [])
  return raw as KnowledgeGap[]
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
