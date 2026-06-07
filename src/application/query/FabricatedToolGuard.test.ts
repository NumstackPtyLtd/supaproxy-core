import { describe, it, expect } from 'vitest'
import { containsFabricatedToolCall } from './FabricatedToolGuard.js'

describe('containsFabricatedToolCall', () => {
  it('detects fabricated function-call and function-result syntax', () => {
    const answer = 'Let me look that up.\n<function_calls>\n<invoke name="get_customer">\n</invoke>\n</function_calls>\n<function_result>\n{ "name": "Sarah Mitchell" }\n</function_result>'
    expect(containsFabricatedToolCall(answer)).toBe(true)
  })

  it('detects generic tool_call / tool_result tags', () => {
    expect(containsFabricatedToolCall('<tool_call>get_kyc_status</tool_call>')).toBe(true)
    expect(containsFabricatedToolCall('<tool_result>{"kyc":"passed"}</tool_result>')).toBe(true)
  })

  it('does not flag an ordinary grounded answer', () => {
    expect(containsFabricatedToolCall('I do not have that in my knowledge base yet.')).toBe(false)
    expect(containsFabricatedToolCall('The minimum loan amount is 1,000 units.')).toBe(false)
  })
})
