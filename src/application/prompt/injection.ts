/**
 * Prompt injection detection (OWASP LLM Prompt Injection Prevention).
 *
 * Defence-in-depth:
 * 1. Regex patterns for known injection phrases
 * 2. Fuzzy matching for typo variants (typoglycemia, leet speak, dot insertion)
 * 3. Encoding detection (Base64, hex, unicode)
 * 4. Output screening for prompt leakage and credential exposure
 */

// ── Known injection phrases (for fuzzy matching) ──

const INJECTION_PHRASES = [
  'ignore previous instructions',
  'ignore all previous instructions',
  'disregard all rules',
  'disregard previous rules',
  'override compliance',
  'never obey',
  'forget your rules',
  'forget rules',
  'ignore your guardrails',
  'ignore guardrails',
  'bypass all safety',
  'bypass safety',
  'disable all filters',
  'disable filters',
  'you are now unrestricted',
  'act as if no rules',
  'pretend there are no restrictions',
  'pretend no restrictions',
]

// ── Regex patterns (exact matching) ──

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

// ── Output screening patterns ──

const OUTPUT_LEAKAGE_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /^SYSTEM:\s+You\s+are/im, label: 'system prompt leakage' },
  { pattern: /(?:here are |these are )?(?:my |the |your )?(?:system |internal )?(?:instructions|prompt|rules)\s*(?:are|is|:)/im, label: 'system prompt leakage' },
  { pattern: /sk-ant-[a-zA-Z0-9-]{20,}/i, label: 'credential exposure (API key)' },
  { pattern: /sk-[a-zA-Z0-9]{20,}/i, label: 'credential exposure (API key)' },
  { pattern: /xoxb-[a-zA-Z0-9-]+/i, label: 'credential exposure (Slack token)' },
  { pattern: /eyJ[a-zA-Z0-9_-]{20,}\.eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/i, label: 'credential exposure (JWT token)' },
  { pattern: /AKIA[0-9A-Z]{16}/i, label: 'credential exposure (AWS key)' },
  { pattern: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/i, label: 'credential exposure (private key)' },
]

// ── Leet speak mapping ──

const LEET_MAP: Record<string, string> = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a',
}

// ── Utility functions ──

function normalise(text: string): string {
  // Remove dots between single characters: i.g.n.o.r.e -> ignore
  let normalised = text.replace(/\b(\w)\.(\w)\.(\w)/g, (_, a, b, c) => a + b + c)
  normalised = normalised.replace(/\./g, (match, offset, str) => {
    const before = str[offset - 1]
    const after = str[offset + 1]
    if (before && after && /[a-z]/i.test(before) && /[a-z]/i.test(after)) return ''
    return match
  })

  // Replace leet speak characters
  normalised = normalised.replace(/[013457@]/g, (ch) => LEET_MAP[ch] || ch)

  // Collapse whitespace
  normalised = normalised.replace(/\s+/g, ' ').trim()

  return normalised.toLowerCase()
}

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}

function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 1
  return 1 - levenshtein(a, b) / maxLen
}

function decodeBase64Segments(text: string): string[] {
  const b64Regex = /[A-Za-z0-9+/]{20,}={0,2}/g
  const segments: string[] = []
  let match
  while ((match = b64Regex.exec(text)) !== null) {
    try {
      const decoded = Buffer.from(match[0], 'base64').toString('utf-8')
      // Only include if the decoded text is readable ASCII
      if (/^[\x20-\x7E\s]+$/.test(decoded) && decoded.length > 5) {
        segments.push(decoded)
      }
    } catch { /* not valid base64 */ }
  }
  return segments
}

function decodeHexEscapes(text: string): string {
  return text.replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
}

function decodeUnicodeEscapes(text: string): string {
  return text.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
}

// ── Fuzzy phrase matching ──

function fuzzyMatchesInjection(text: string): string | null {
  const normalised = normalise(text)
  const words = normalised.split(' ')

  // Slide a window over the normalised text and check against known phrases
  for (const phrase of INJECTION_PHRASES) {
    const phraseWords = phrase.split(' ')
    const windowSize = phraseWords.length

    for (let i = 0; i <= words.length - windowSize; i++) {
      const window = words.slice(i, i + windowSize).join(' ')
      const sim = similarity(window, phrase)
      if (sim >= 0.75) {
        return phrase
      }
    }
  }

  return null
}

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
