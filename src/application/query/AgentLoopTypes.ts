import type { ExecutionRailRegistry, RetrievalRailRegistry } from '@supaproxy/guardrails'
import type { ToolEntry, ToolCallRecord } from './ToolCallProcessor.js'

export interface AgentLoopConfig {
  model: string
  systemPrompt: string
  maxToolRounds: number
  tools: ToolEntry[]
  history: Array<{ role: 'user' | 'assistant'; content: string }>
  apiKey: string
  workspaceId: string
  conversationId: string
  executionRails: ExecutionRailRegistry | null
  retrievalRails: RetrievalRailRegistry | null
}

export interface AgentLoopResult {
  answer: string
  toolsCalled: ToolCallRecord[]
  connectionsHit: string[]
  tokensInput: number
  tokensOutput: number
  costUsd: number
  durationMs: number
  error: string | null
}

export interface QueryMeta {
  consumerType: string
  channel?: string
  userId?: string
  userName?: string
  conversationId?: string
  sessionId?: string
  systemPromptOverride?: string
  skipTools?: boolean
  routedFrom?: string
  routedFromConversationId?: string
  priorHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
}

export interface QueryResult {
  answer: string
  toolsCalled: string[]
  connectionsHit: string[]
  tokensInput: number
  tokensOutput: number
  costUsd: number
  durationMs: number
  error: string | null
  conversationId: string
  sessionId: string
}
