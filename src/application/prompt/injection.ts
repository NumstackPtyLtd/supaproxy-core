/**
 * Prompt injection detection (OWASP LLM Prompt Injection Prevention).
 *
 * Defence-in-depth:
 * 1. Regex patterns for known injection phrases
 * 2. Fuzzy matching for typo variants (typoglycemia, leet speak, dot insertion)
 * 3. Encoding detection (Base64, hex, unicode)
 * 4. Output screening for prompt leakage and credential exposure
 */

import {
  INJECTION_PATTERNS,
  OUTPUT_LEAKAGE_PATTERNS,
  fuzzyMatchesInjection,
  decodeBase64Segments,
  decodeHexEscapes,
  decodeUnicodeEscapes,
} from './injection-patterns.js'

// ── Public API ──

export interface InjectionCheckResult {
  safe: boolean
  violations: string[]
}

export function checkPromptInjection(content: string): InjectionCheckResult {
  const violations: string[] = []

  // 1. Exact regex patterns
  for (const pattern of INJECTION_PATTERNS) {
    const match = content.match(pattern)
    if (match) {
      violations.push(match[0])
    }
  }

  // 2. Decode and re-check
  const decoded = decodeHexEscapes(decodeUnicodeEscapes(content))
  if (decoded !== content) {
    for (const pattern of INJECTION_PATTERNS) {
      const match = decoded.match(pattern)
      if (match && !violations.includes(match[0])) {
        violations.push(`encoded: ${match[0]}`)
      }
    }
  }

  // 3. Base64 segments
  const b64Decoded = decodeBase64Segments(content)
  for (const segment of b64Decoded) {
    for (const pattern of INJECTION_PATTERNS) {
      const match = segment.match(pattern)
      if (match) {
        violations.push(`base64: ${match[0]}`)
      }
    }
    // Also fuzzy check decoded Base64
    const fuzzy = fuzzyMatchesInjection(segment)
    if (fuzzy) {
      violations.push(`base64 fuzzy: ${fuzzy}`)
    }
  }

  // 4. Fuzzy matching (only if no exact matches found, to avoid duplicates)
  if (violations.length === 0) {
    const fuzzy = fuzzyMatchesInjection(content)
    if (fuzzy) {
      violations.push(`fuzzy: ${fuzzy}`)
    }
  }

  return {
    safe: violations.length === 0,
    violations,
  }
}

export function checkOutputLeakage(output: string): InjectionCheckResult {
  const violations: string[] = []

  for (const { pattern, label } of OUTPUT_LEAKAGE_PATTERNS) {
    if (pattern.test(output)) {
      violations.push(label)
    }
  }

  return {
    safe: violations.length === 0,
    violations,
  }
}
