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
export const MAX_PAGINATION_LIMIT = 100
export const DEFAULT_KNOWLEDGE_GAPS_LIMIT = 20
export const DEFAULT_SECURITY_TOP_WORKSPACES = 5
export const DEFAULT_SECURITY_RECENT_EVENTS = 10

// ── Query validation ──

export const MAX_QUERY_LENGTH = 10_000
export const MAX_SYSTEM_PROMPT_LENGTH = 10_000

// ── Workspace defaults ──

export const DEFAULT_WORKSPACE_NAME = '#general'
export const DEFAULT_SYSTEM_PROMPT = 'You are a helpful assistant.'
export const DEFAULT_RECEPTIONIST_PROMPT = 'You are a helpful receptionist.'

// Status constants
export const STATUS_ACTIVE = 'active'
export const STATUS_PAUSED = 'paused'
export const STATUS_ARCHIVED = 'archived'
export const STATUS_OPEN = 'open'
export const STATUS_COLD = 'cold'
export const STATUS_CLOSED = 'closed'
export const STATUS_CONNECTED = 'connected'
export const STATUS_DISCONNECTED = 'disconnected'
export const STATUS_PENDING = 'pending'
export const STATUS_COMPLETE = 'complete'
export const STATUS_FAILED = 'failed'
export const STATUS_SAVED = 'saved'

// Consumer types
export const CONSUMER_TYPE_SYSTEM = 'system'

// Queue names
export const QUEUE_LIFECYCLE = 'lifecycle'
export const QUEUE_COLD_MESSAGES = 'cold-messages'
export const QUEUE_CONVERSATION_STATS = 'conversation-stats'
export const QUEUE_KNOWLEDGE_SYNC = 'knowledge-sync'
export const KNOWLEDGE_SYNC_CONCURRENCY = 1

// Validation limits
export const MAX_ORG_NAME_LENGTH = 255
export const MAX_USER_NAME_LENGTH = 255
export const MAX_EMAIL_LENGTH = 255
export const MAX_PASSWORD_LENGTH = 255
export const MIN_PASSWORD_LENGTH = 8
export const MAX_WORKSPACE_NAME_LENGTH = 255
export const MAX_MODEL_ID_LENGTH = 100
export const MAX_TEAM_NAME_LENGTH = 255
export const MAX_SESSION_ID_LENGTH = 255
export const MAX_MCP_URL_LENGTH = 2048
export const MAX_MCP_COMMAND_LENGTH = 1000
export const MAX_MCP_ARGS_COUNT = 50
export const MAX_MCP_HEADER_LENGTH = 2000
export const MAX_TIMEOUT_MINUTES = 10080
export const MAX_HISTORY_ITEMS = 100
export const MAX_CHANNEL_ID_LENGTH = 100
export const MAX_CREDENTIAL_VALUE_LENGTH = 500
export const MAX_CONSUMER_TYPE_LENGTH = 50

// Lifecycle scan interval
export const LIFECYCLE_SCAN_INTERVAL_MS = 30_000

// JWT
export const JWT_EXPIRY = '24h'

// BullMQ worker concurrency
export const COLD_MESSAGE_CONCURRENCY = 3
export const STATS_WORKER_CONCURRENCY = 2

// ── Knowledge retrieval ──

export const DEFAULT_CHUNK_SIZE = 500
export const DEFAULT_CHUNK_OVERLAP = 50
export const DEFAULT_RETRIEVAL_LIMIT = 5
export const DEFAULT_RETRIEVAL_MIN_SCORE = 0.3
export const DEFAULT_EMBEDDING_DIMENSIONS = 1536

// ── OAuth ──

export const OAUTH_RESPONSE_TYPE = 'code'
export const OAUTH_PROMPT = 'consent'
export const OAUTH_SETTING_SUFFIXES = ['access_token', 'refresh_token', 'resource_id', 'resource_url']

// ── OAuth error codes ──

export const ERROR_NO_ORG = 'no_org'
export const ERROR_NO_CREDENTIALS = 'no_credentials'
export const ERROR_NO_REFRESH_TOKEN = 'no_refresh_token'
export const ERROR_REFRESH_FAILED = 'refresh_failed'
export const ERROR_PLUGIN_NOT_FOUND = 'plugin_not_found'

// ── Stats analysis fallbacks ──

export const DEFAULT_SENTIMENT_SCORE = 3
