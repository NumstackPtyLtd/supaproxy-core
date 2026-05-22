import { DEFAULT_SYSTEM_PROMPT } from '../../defaults.js'
import { buildScopeEnforcementClause, formatKnowledgeContext } from '../../prompts.js'
import type { PromptResolver } from '../prompt/PromptResolver.js'
import type { RetrieveKnowledgeForWorkspaceUseCase } from '../knowledge/RetrieveKnowledgeForWorkspaceUseCase.js'
import pino from 'pino'

const log = pino({ name: 'system-prompt-builder' })

export interface SystemPromptInput {
  workspace: { system_prompt: string | null; is_default: boolean; org_id: string | null }
  systemPromptOverride?: string
  workspaceId: string
  queryToForward: string
}

export interface SystemPromptResult {
  text: string
  knowledgeChunksUsed: number
}

export async function buildSystemPrompt(
  input: SystemPromptInput,
  promptResolver?: PromptResolver,
  retrieveKnowledge?: RetrieveKnowledgeForWorkspaceUseCase,
): Promise<SystemPromptResult> {
  const basePrompt = input.systemPromptOverride || input.workspace.system_prompt || DEFAULT_SYSTEM_PROMPT
  let systemPrompt = basePrompt
  let knowledgeChunksUsed = 0

  if (!input.systemPromptOverride && !input.workspace.is_default) {
    const scopeClause = promptResolver
      ? await promptResolver.resolve('scope_enforcement', input.workspace.org_id || '', input.workspaceId)
      : buildScopeEnforcementClause()
    systemPrompt = `${basePrompt}\n\n${scopeClause}`
  }

  // Retrieve relevant knowledge and append to system prompt
  if (retrieveKnowledge) {
    try {
      const retrieval = await retrieveKnowledge.execute(input.workspaceId, input.queryToForward)
      if (retrieval.chunks.length > 0) {
        systemPrompt += formatKnowledgeContext(retrieval.chunks)
        knowledgeChunksUsed = retrieval.chunks.length
      }
    } catch (err) {
      log.warn({ err, workspaceId: input.workspaceId }, 'Knowledge retrieval failed, continuing without context')
    }
  }

  return { text: systemPrompt, knowledgeChunksUsed }
}
