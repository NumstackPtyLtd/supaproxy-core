/**
 * System defaults: named constants for all configurable values.
 *
 * These are the fallback defaults when no workspace, org, or env
 * override is provided. Eventually these will load from a
 * configuration table, but for now they live here as a single
 * source of truth (not scattered across use cases).
 *
 * RULE: no magic numbers or strings in use cases. Import from here.
 */

// ── Session and lifecycle ──

export const SESSION_TTL_SECONDS = 1800
export const SESSION_COOKIE_MAX_AGE = 86400
export const DEFAULT_COLD_TIMEOUT_MINUTES = 30
export const DEFAULT_CLOSE_TIMEOUT_MINUTES = 60

// ── Agent loop ──

export const DEFAULT_MAX_RESPONSE_TOKENS = 4096
export const DEFAULT_MAX_TOOL_ROUNDS = 10
export const DEFAULT_COLD_MESSAGE_MAX_TOKENS = 150
export const DEFAULT_STATS_ANALYSIS_MAX_TOKENS = 1024

// ── Pagination ──

export const DEFAULT_PAGINATION_LIMIT = 20

// ── Query validation ──

export const MAX_QUERY_LENGTH = 10_000
export const MAX_SYSTEM_PROMPT_LENGTH = 10_000

// ── Workspace defaults ──

export const DEFAULT_WORKSPACE_NAME = '#general'
export const DEFAULT_SYSTEM_PROMPT = 'You are a helpful assistant.'
export const DEFAULT_RECEPTIONIST_PROMPT = 'You are a helpful receptionist.'
