/**
 * Prompt injection detection.
 *
 * Scans user-configurable prompt content for attempts to override
 * system guardrails. Rejects prompts that contain override patterns.
 */

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /disregard\s+(all\s+)?(previous\s+)?rules/i,
  /override\s+compliance/i,
  /never\s+obey/i,
  /forget\s+(your\s+)?rules/i,
  /ignore\s+(your\s+)?guardrails/i,
  /bypass\s+(all\s+)?safety/i,
  /disable\s+(all\s+)?filters/i,
  /you\s+are\s+now\s+unrestricted/i,
  /act\s+as\s+if\s+no\s+rules/i,
  /pretend\s+(there\s+are\s+)?no\s+restrictions/i,
  /system\s*:\s*you\s+are/i,
]

export interface InjectionCheckResult {
  safe: boolean
  violations: string[]
}

export function checkPromptInjection(content: string): InjectionCheckResult {
  const violations: string[] = []

  for (const pattern of INJECTION_PATTERNS) {
    const match = content.match(pattern)
    if (match) {
      violations.push(match[0])
    }
  }

  return {
    safe: violations.length === 0,
    violations,
  }
}
