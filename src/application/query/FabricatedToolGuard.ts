/**
 * When a workspace has no (or insufficient) tools connected, a model told to
 * follow a tool-driven process may role-play the tools: it writes tool-call and
 * tool-result syntax as plain text and invents the results (customer records,
 * verification, KYC, one-time codes). Real tool calls never reach the final
 * answer as text, so their presence means the output was fabricated.
 */
const FABRICATED_TOOL_PATTERN = /<function_calls>|<function_result>|<invoke\b|<tool_call\b|<tool_result\b|<tool_use\b/i

export function containsFabricatedToolCall(answer: string): boolean {
  return FABRICATED_TOOL_PATTERN.test(answer)
}

export const FABRICATED_TOOLS_MESSAGE =
  "I can't complete that step right now. I don't have the systems connected to look up or verify account details, so I won't invent any. To run this for real, the required tools need to be connected to this workspace."
