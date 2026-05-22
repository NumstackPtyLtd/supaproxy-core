import type { AIContentBlock, AIToolSpec } from '@supaproxy/providers'
import type { ExecutionRailRegistry, RetrievalRailRegistry } from '@supaproxy/guardrails'
import type { GuardrailEventRepository, GuardrailEventData } from '../../domain/guardrail/repository.js'
import { generateId } from '../../domain/shared/EntityId.js'
import { ConversationStatus } from '../../domain/conversation/ConversationStatus.js'
import pino from 'pino'

const log = pino({ name: 'tool-call-processor' })

export interface ToolEntry {
  name: string
  connection: string
  spec: AIToolSpec
  isWrite: boolean
  callFn: (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text?: string }>; isError: boolean }>
}

export interface ToolCallRecord {
  name: string
  connection: string
  args: Record<string, unknown>
  duration_ms: number
}

interface ProcessToolCallsConfig {
  tools: ToolEntry[]
  workspaceId: string
  conversationId: string
  originalQuery: string
  executionRails: ExecutionRailRegistry | null
  retrievalRails: RetrievalRailRegistry | null
}

interface ProcessToolCallsResult {
  toolResults: AIContentBlock[]
  toolsCalled: ToolCallRecord[]
  connectionsHit: string[]
}

export class ToolCallProcessor {
  constructor(
    private readonly guardrailEventRepo?: GuardrailEventRepository,
  ) {}

  async processToolCalls(
    toolUses: AIContentBlock[],
    config: ProcessToolCallsConfig,
  ): Promise<ProcessToolCallsResult> {
    const toolResults: AIContentBlock[] = []
    const toolsCalled: ToolCallRecord[] = []
    const connectionsHit: string[] = []

    for (const tu of toolUses) {
      const toolDef = config.tools.find(t => t.name === tu.name)
      const connName = toolDef?.connection || 'unknown'
      const toolStart = Date.now()

      // Execution rail: validate tool call before executing
      if (config.executionRails && toolDef) {
        const railResult = await config.executionRails.validate({
          toolName: tu.name!,
          toolArgs: tu.input as Record<string, unknown>,
          originalQuery: config.originalQuery,
          workspaceId: config.workspaceId,
          isWrite: toolDef.isWrite,
        })
        if (!railResult.allowed) {
          log.info({ tool: tu.name, reason: railResult.reason }, 'Tool call blocked by execution rail')
          toolResults.push({ type: 'tool_result', id: tu.id, text: `Tool call blocked: ${railResult.reason}` })
          const plugin = railResult.pluginId ? config.executionRails!.list().find(p => p.id === railResult.pluginId) : undefined
          this.writeGuardrailEvent({
            id: generateId(), workspace_id: config.workspaceId, conversation_id: config.conversationId,
            event_type: 'execution_blocked', plugin_id: railResult.pluginId || 'unknown',
            context: { tool_name: tu.name!, tool_args: JSON.stringify(tu.input).substring(0, 500), connection_name: connName, original_query: config.originalQuery },
            outcome: { reason: railResult.reason || null },
            display: plugin?.eventDisplay || [],
            actions: plugin?.eventActions || [],
            status: ConversationStatus.OPEN,
          })
          continue
        }
      }

      try {
        const callResult = await toolDef!.callFn(tu.input as Record<string, unknown>)
        let resultText = callResult.content
          .filter(c => c.type === 'text')
          .map(c => c.text || '')
          .join('\n')

        // Retrieval rail: sanitise tool output before feeding back to LLM
        if (config.retrievalRails) {
          const sanitised = await config.retrievalRails.sanitise(resultText)
          if (sanitised.stripped.length > 0) {
            const plugin = sanitised.pluginId ? config.retrievalRails!.list().find(p => p.id === sanitised.pluginId) : undefined
            this.writeGuardrailEvent({
              id: generateId(), workspace_id: config.workspaceId, conversation_id: config.conversationId,
              event_type: 'retrieval_stripped', plugin_id: sanitised.pluginId || 'unknown',
              context: { tool_name: tu.name!, connection_name: connName, original_query: config.originalQuery },
              outcome: { original_content: resultText.substring(0, 1000), stripped_content: sanitised.stripped.join(', ').substring(0, 500) },
              display: plugin?.eventDisplay || [],
              actions: plugin?.eventActions || [],
              status: ConversationStatus.OPEN,
            })
          }
          resultText = sanitised.content
        }

        toolResults.push({ type: 'tool_result', id: tu.id, text: resultText })
        if (!connectionsHit.includes(connName)) connectionsHit.push(connName)
        toolsCalled.push({ name: tu.name!, connection: connName, args: tu.input as Record<string, unknown>, duration_ms: Date.now() - toolStart })
      } catch (err) {
        toolResults.push({ type: 'tool_result', id: tu.id, text: `Tool error: ${(err as Error).message}` })
      }
    }

    return { toolResults, toolsCalled, connectionsHit }
  }

  private writeGuardrailEvent(data: GuardrailEventData): void {
    if (!this.guardrailEventRepo) return
    this.guardrailEventRepo.create(data).catch(err => {
      log.error({ error: (err as Error).message }, 'Failed to write guardrail event')
    })
  }
}
