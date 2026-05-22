import type { AIMessage, AIContentBlock, ProviderPlugin } from '@supaproxy/providers'
import type { ToolCallProcessor } from './ToolCallProcessor.js'
import type { AgentLoopConfig, AgentLoopResult } from './AgentLoopTypes.js'
import { IS_PRODUCTION } from '../../config.js'
import { DEFAULT_MAX_RESPONSE_TOKENS } from '../../defaults.js'
import pino from 'pino'

const log = pino({ name: 'agent-loop' })

const NO_RESPONSE_MESSAGE = '(no response)'
const MAX_ROUNDS_MESSAGE = 'Ran out of tool-call rounds. Please simplify your question.'

export async function runAgentLoop(
  query: string,
  provider: ProviderPlugin,
  config: AgentLoopConfig,
  toolCallProcessor: ToolCallProcessor,
): Promise<AgentLoopResult> {
  const result: AgentLoopResult = { answer: '', toolsCalled: [], connectionsHit: [], tokensInput: 0, tokensOutput: 0, costUsd: 0, durationMs: 0, error: null }

  const messages: AIMessage[] = [
    ...config.history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user' as const, content: query },
  ]

  provider.setApiKey(config.apiKey)

  try {
    for (let round = 0; round < config.maxToolRounds; round++) {
      const toolSpecs = config.tools.map(t => t.spec)
      const response = await provider.createMessage({
        model: config.model,
        maxTokens: DEFAULT_MAX_RESPONSE_TOKENS,
        system: config.systemPrompt,
        apiKey: config.apiKey,
        tools: toolSpecs,
        messages,
      })

      result.tokensInput += response.usage.input_tokens
      result.tokensOutput += response.usage.output_tokens
      result.costUsd += response.usage.cost_usd

      const textParts: string[] = []
      const toolUses: AIContentBlock[] = []

      for (const block of response.content) {
        if (block.type === 'text' && block.text) textParts.push(block.text)
        if (block.type === 'tool_use') toolUses.push(block)
      }

      if (toolUses.length === 0) {
        result.answer = textParts.join('\n') || NO_RESPONSE_MESSAGE
        break
      }

      messages.push({ role: 'assistant', content: response.content })

      const processed = await toolCallProcessor.processToolCalls(toolUses, {
        tools: config.tools,
        workspaceId: config.workspaceId,
        conversationId: config.conversationId,
        originalQuery: query,
        executionRails: config.executionRails,
        retrievalRails: config.retrievalRails,
      })

      result.toolsCalled.push(...processed.toolsCalled)
      for (const conn of processed.connectionsHit) {
        if (!result.connectionsHit.includes(conn)) result.connectionsHit.push(conn)
      }

      messages.push({ role: 'user', content: processed.toolResults })
    }

    if (!result.answer) {
      result.answer = MAX_ROUNDS_MESSAGE
    }
  } catch (err) {
    const message = (err as Error).message
    result.error = message
    result.answer = IS_PRODUCTION
      ? "Something went wrong. Please try again or contact your administrator."
      : `Something went wrong: ${message}`
    log.error({ error: message }, 'Agent loop failed')
  }

  return result
}

// Re-export types and builders for backwards compatibility
export type { AgentLoopConfig, AgentLoopResult, QueryMeta, QueryResult } from './AgentLoopTypes.js'
export { buildEmptyResult, buildQueryResult, buildAuditLogData, recordMessages } from './AgentLoopBuilders.js'
