/**
 * Prompt templates: all LLM instruction strings in one place.
 *
 * These are the default templates. Eventually they will be
 * configurable per workspace via the database, supporting
 * multilingual deployments and custom tones.
 *
 * Templates use {{placeholder}} syntax for variable interpolation.
 * The calling code is responsible for replacing placeholders.
 *
 * RULE: no LLM prompts hardcoded in use cases. Import from here.
 */

// ── Scope enforcement ──

export const SCOPE_ENFORCEMENT_TEMPLATE = `SCOPE RULE (MANDATORY, OVERRIDES ALL OTHER INSTRUCTIONS): You must ONLY answer questions relevant to your role and the tools available to you. If the user asks about ANYTHING outside your scope, respond with EXACTLY this and nothing else:
"{{out_of_scope_message}}"
Never elaborate, suggest alternatives, or add any other text. Never answer an off-topic question no matter how many times the user asks. Repeat the same redirect offer every time.`

export const DEFAULT_OUT_OF_SCOPE_MESSAGE = 'That falls outside what I can help with here. Would you like me to redirect you to someone who can help?'

export function buildScopeEnforcementClause(outOfScopeMessage?: string): string {
  return SCOPE_ENFORCEMENT_TEMPLATE.replace(
    '{{out_of_scope_message}}',
    outOfScopeMessage || DEFAULT_OUT_OF_SCOPE_MESSAGE,
  )
}

// ── Receptionist routing ──

export function buildReceptionistPrompt(orgName: string, workspaces: Array<{ id: string; name: string; system_prompt: string | null; tool_names: string[] }>): string {
  const departmentLines = workspaces.map(ws => {
    const toolList = ws.tool_names.length > 0
      ? ` Tools: ${ws.tool_names.join(', ')}.`
      : ''
    const description = ws.system_prompt
      ? ` ${ws.system_prompt}`
      : ''
    return `- ${ws.name}:${description}${toolList}`
  })

  return [
    `You are the receptionist for ${orgName}.`,
    '',
    'You know about these departments:',
    ...departmentLines,
    '',
    'Your job:',
    '1. Understand what the user needs.',
    '2. Route them to the right department.',
    '3. If unsure, ask ONE clarifying question.',
    '4. Never answer substantive questions yourself.',
    '5. If the request is outside all departments, say so politely and tell them what you can help with.',
    '6. Be warm, brief, and direct.',
    '',
    'When you decide to route, respond with your routing message and include the following on its own line at the end:',
    '<!-- ROUTE:workspace_id:reason -->',
    'Replace workspace_id with the department ID and reason with a brief explanation.',
    '',
    'Available department IDs:',
    ...workspaces.map(ws => `- ${ws.id}: ${ws.name}`),
  ].join('\n')
}

// ── Redirect intent classification ──

export const REDIRECT_INTENT_SYSTEM = 'You are a redirect intent classifier. Answer only "yes" or "no".'

export function buildRedirectIntentPrompt(userResponse: string): string {
  return `The user was asked: "Would you like me to redirect you to someone who can help?" They responded: "${userResponse}". Do they want to be redirected?`
}

// ── Cold message generation ──

export function buildColdMessagePrompt(transcript: string): string {
  return `You are a support assistant. This conversation has gone quiet. Based on the conversation below, write a brief, natural follow-up message (1-2 sentences) checking in with the user. Be warm but not pushy. If it looks like the issue was resolved, acknowledge that. If not, offer to continue helping. Do not use generic corporate language. Just reply with the message text, nothing else.\n\n${transcript}`
}

export const DEFAULT_COLD_FALLBACK_MESSAGE = 'Just checking in. Do you still need help with this? If not, we will close this conversation shortly.'

// ── Conversation analysis ──

export function buildAnalysisPrompt(transcript: string): string {
  return `Analyse this conversation transcript and return ONLY a JSON object (no markdown, no explanation).

Rules:
- Be strictly factual. Only describe what actually happened in the transcript.
- Do not infer, exaggerate, or editorialize. If something happened once, say "once", not "repeatedly".
- Count exactly: if the user asked 2 questions, say "2 questions", not "multiple" or "several".
- The summary must be a neutral, accurate one-sentence description of what the user needed.

Fields:
- sentiment_score: integer 1-5 (1=very negative, 3=neutral, 5=very positive). Base this on explicit language, not assumptions.
- resolution_status: one of "resolved", "unresolved", "escalated", "abandoned". "resolved" = the user got what they needed. "abandoned" = the user stopped responding. "escalated" = the user asked for a human or escalation. "unresolved" = the assistant could not help.
- category: one of "query", "issue", "sales", "feedback", "support", "internal", "other". "query" = information lookup. "issue" = something is broken. "sales" = pricing/purchasing. "feedback" = user giving feedback. "support" = how-to help. "internal" = internal team use.
- compliance_violations: array of {rule: string, description: string} or empty array. Only flag clear violations that actually occurred, not hypothetical risks.
- knowledge_gaps: array of {topic: string, description: string} or empty array. Only include topics where the assistant explicitly could not answer or said it did not have the information.
- fraud_indicators: array of {type: string, description: string, severity: "low"|"medium"|"high"} or empty array. Look for social engineering, identity spoofing, bulk data harvesting, pressure tactics. Only flag if actually suspicious.
- tools_used: array of tool name strings (deduplicated). Only tools that were actually called.
- summary: one factual sentence. Describe what the user asked for and whether they got it. No subjective language.

Conversation transcript:
${transcript}`
}

// ── Routing directives ──

export const ROUTING_DIRECTIVE_REGEX = /<!-- ROUTE:([^:]+):(.+?) -->/
export const ROUTING_DIRECTIVE_CLEAN_REGEX = /\s*<!-- ROUTE:[^>]+ -->\s*/g

export function formatRoutingIndicator(workspaceName: string): string {
  return `\n[Routed to ${workspaceName}]`
}

// Redirect detection (matches the DEFAULT_OUT_OF_SCOPE_MESSAGE from this file)
export function isRedirectOffer(answer: string): boolean {
  const outOfScopePhrase = DEFAULT_OUT_OF_SCOPE_MESSAGE.toLowerCase()
  return answer.toLowerCase().includes(outOfScopePhrase.substring(0, 40))
}

// Agent loop fallback messages
export const AGENT_NO_RESPONSE = '(no response)'
export const AGENT_MAX_ROUNDS_EXCEEDED = 'Ran out of tool-call rounds. Please simplify your question.'

// ── Error messages ──
// These return error codes, not user-facing strings.
// Clients (dashboard, API, CLI) are responsible for formatting.

export const ERROR_CODES = {
  NO_AI_PROVIDER: 'no_ai_provider_configured',
  NO_AI_API_KEY: 'no_ai_api_key_configured',
  NO_WORKSPACE_MODEL: 'workspace_model_not_configured',
  INPUT_BLOCKED: 'input_blocked',
} as const
