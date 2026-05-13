import mysql from 'mysql2/promise';
import pino from 'pino';
import type { ColumnInfoRow } from './types.js';
import { generateId } from '../domain/shared/EntityId.js';

const log = pino({ name: 'migrations' });

interface Migration {
  version: number;
  name: string;
  up: (pool: mysql.Pool) => Promise<void>;
}

const migrations: Migration[] = [
  {
    version: 1,
    name: 'initial schema',
    up: async (pool) => {
      // --- Organisation layer ---

      await pool.execute(`
        CREATE TABLE IF NOT EXISTS organisations (
          id VARCHAR(64) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          slug VARCHAR(100) UNIQUE NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);

      await pool.execute(`
        CREATE TABLE IF NOT EXISTS org_settings (
          id VARCHAR(64) PRIMARY KEY,
          org_id VARCHAR(64) NOT NULL,
          key_name VARCHAR(100) NOT NULL,
          value TEXT NOT NULL,
          is_secret BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (org_id) REFERENCES organisations(id) ON DELETE CASCADE,
          UNIQUE KEY unique_setting (org_id, key_name)
        )
      `);

      await pool.execute(`
        CREATE TABLE IF NOT EXISTS org_compliance (
          id VARCHAR(64) PRIMARY KEY,
          org_id VARCHAR(64) NOT NULL,
          rule_type VARCHAR(50) NOT NULL,
          enabled BOOLEAN DEFAULT TRUE,
          config JSON NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (org_id) REFERENCES organisations(id) ON DELETE CASCADE,
          UNIQUE KEY unique_org_rule (org_id, rule_type)
        )
      `);

      // --- Teams (belongs to org) ---

      await pool.execute(`
        CREATE TABLE IF NOT EXISTS teams (
          id VARCHAR(64) PRIMARY KEY,
          org_id VARCHAR(64) NOT NULL,
          name VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (org_id) REFERENCES organisations(id) ON DELETE CASCADE,
          UNIQUE KEY unique_team_name (org_id, name)
        )
      `);

      // --- Users (belongs to org, optionally to a team) ---

      await pool.execute(`
        CREATE TABLE IF NOT EXISTS users (
          id VARCHAR(64) PRIMARY KEY,
          org_id VARCHAR(64),
          email VARCHAR(255) UNIQUE NOT NULL,
          name VARCHAR(255) NOT NULL,
          password_hash VARCHAR(512) NOT NULL,
          org_role ENUM('admin', 'workspace_admin', 'user') DEFAULT 'user',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (org_id) REFERENCES organisations(id) ON DELETE CASCADE
        )
      `);

      // --- Workspaces (belongs to org) ---

      await pool.execute(`
        CREATE TABLE IF NOT EXISTS workspaces (
          id VARCHAR(64) PRIMARY KEY,
          org_id VARCHAR(64),
          team_id VARCHAR(64),
          name VARCHAR(255) NOT NULL,
          status ENUM('active', 'paused', 'archived') DEFAULT 'active',
          model VARCHAR(100) NOT NULL,
          system_prompt TEXT,
          max_tool_rounds INT DEFAULT 10,
          max_thread_history INT DEFAULT 50,
          created_by VARCHAR(64),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (org_id) REFERENCES organisations(id) ON DELETE CASCADE,
          FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL,
          FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
        )
      `);

      // --- Workspace resources ---

      await pool.execute(`
        CREATE TABLE IF NOT EXISTS connections (
          id VARCHAR(64) PRIMARY KEY,
          workspace_id VARCHAR(64) NOT NULL,
          name VARCHAR(100) NOT NULL,
          type ENUM('mcp', 'rest', 'graphql', 'database', 'webhook') NOT NULL,
          status ENUM('connected', 'disconnected', 'error', 'idle') DEFAULT 'disconnected',
          config JSON NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
          UNIQUE KEY unique_conn_name (workspace_id, name)
        )
      `);

      await pool.execute(`
        CREATE TABLE IF NOT EXISTS connection_tools (
          id VARCHAR(64) PRIMARY KEY,
          connection_id VARCHAR(64) NOT NULL,
          name VARCHAR(100) NOT NULL,
          description TEXT,
          input_schema JSON,
          is_write BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE CASCADE,
          UNIQUE KEY unique_tool_name (connection_id, name)
        )
      `);

      await pool.execute(`
        CREATE TABLE IF NOT EXISTS knowledge_sources (
          id VARCHAR(64) PRIMARY KEY,
          workspace_id VARCHAR(64) NOT NULL,
          type ENUM('confluence', 'file', 'inline', 'url') NOT NULL,
          name VARCHAR(255) NOT NULL,
          config JSON NOT NULL,
          status ENUM('pending', 'syncing', 'synced', 'error') DEFAULT 'pending',
          chunks INT DEFAULT 0,
          last_synced_at TIMESTAMP NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        )
      `);

      await pool.execute(`
        CREATE TABLE IF NOT EXISTS guardrails (
          id VARCHAR(64) PRIMARY KEY,
          workspace_id VARCHAR(64) NOT NULL,
          rule_type VARCHAR(50) NOT NULL,
          enabled BOOLEAN DEFAULT TRUE,
          config JSON NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
          UNIQUE KEY unique_guardrail (workspace_id, rule_type)
        )
      `);

      await pool.execute(`
        CREATE TABLE IF NOT EXISTS consumers (
          id VARCHAR(64) PRIMARY KEY,
          workspace_id VARCHAR(64) NOT NULL,
          type VARCHAR(50) NOT NULL,
          config JSON NOT NULL,
          status ENUM('active', 'inactive') DEFAULT 'active',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        )
      `);

      await pool.execute(`
        CREATE TABLE IF NOT EXISTS permissions (
          id VARCHAR(64) PRIMARY KEY,
          workspace_id VARCHAR(64) NOT NULL,
          role VARCHAR(50) NOT NULL,
          tool_patterns JSON NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
          UNIQUE KEY unique_role (workspace_id, role)
        )
      `);

      await pool.execute(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id VARCHAR(64) PRIMARY KEY,
          workspace_id VARCHAR(64) NOT NULL,
          consumer_type VARCHAR(20),
          channel VARCHAR(100),
          user_id VARCHAR(64),
          user_name VARCHAR(255),
          query TEXT NOT NULL,
          tools_called JSON,
          connections_hit JSON,
          knowledge_chunks_used INT DEFAULT 0,
          tokens_input INT DEFAULT 0,
          tokens_output INT DEFAULT 0,
          cost_usd DECIMAL(10,6) DEFAULT 0,
          duration_ms INT DEFAULT 0,
          guardrails_applied JSON,
          error TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_workspace (workspace_id),
          INDEX idx_created (created_at),
          INDEX idx_user (user_id),
          FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        )
      `);

      // --- Conversations (ticket lifecycle) ---

      await pool.execute(`
        CREATE TABLE IF NOT EXISTS conversations (
          id VARCHAR(64) PRIMARY KEY,
          workspace_id VARCHAR(64) NOT NULL,
          consumer_type VARCHAR(20) NOT NULL,
          external_thread_id VARCHAR(255),
          status ENUM('open', 'cold', 'closed') DEFAULT 'open',
          user_id VARCHAR(64),
          user_name VARCHAR(255),
          channel VARCHAR(100),
          message_count INT DEFAULT 0,
          first_message_at TIMESTAMP NULL,
          last_activity_at TIMESTAMP NULL,
          cold_at TIMESTAMP NULL,
          closed_at TIMESTAMP NULL,
          parent_conversation_id VARCHAR(64),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_workspace_status (workspace_id, status),
          INDEX idx_last_activity (last_activity_at),
          INDEX idx_external_thread (workspace_id, consumer_type, external_thread_id),
          FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
          FOREIGN KEY (parent_conversation_id) REFERENCES conversations(id) ON DELETE SET NULL
        )
      `);

      await pool.execute(`
        CREATE TABLE IF NOT EXISTS conversation_messages (
          id VARCHAR(64) PRIMARY KEY,
          conversation_id VARCHAR(64) NOT NULL,
          role ENUM('user', 'assistant') NOT NULL,
          content TEXT NOT NULL,
          audit_log_id VARCHAR(64),
          seq INT NOT NULL DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_conversation_seq (conversation_id, seq),
          FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
        )
      `);

      await pool.execute(`
        CREATE TABLE IF NOT EXISTS conversation_stats (
          id VARCHAR(64) PRIMARY KEY,
          conversation_id VARCHAR(64) NOT NULL UNIQUE,
          sentiment_score TINYINT,
          resolution_status ENUM('resolved', 'unresolved', 'escalated', 'abandoned'),
          compliance_violations JSON,
          knowledge_gaps JSON,
          tools_used JSON,
          total_tokens_input INT DEFAULT 0,
          total_tokens_output INT DEFAULT 0,
          total_cost_usd DECIMAL(10,6) DEFAULT 0,
          total_duration_ms INT DEFAULT 0,
          message_count INT DEFAULT 0,
          duration_seconds INT DEFAULT 0,
          summary TEXT,
          category VARCHAR(30),
          stats_status ENUM('pending', 'complete', 'failed') DEFAULT 'pending',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
        )
      `);
    },
  },
  {
    version: 2,
    name: 'add seq column to conversation_messages',
    up: async (pool) => {
      const [cols] = await pool.execute<ColumnInfoRow[]>("SHOW COLUMNS FROM conversation_messages LIKE 'seq'");
      if (cols.length === 0) {
        await pool.execute("ALTER TABLE conversation_messages ADD COLUMN seq INT NOT NULL DEFAULT 0 AFTER audit_log_id, ADD INDEX idx_conversation_seq (conversation_id, seq)");
      }
    },
  },
  {
    version: 3,
    name: 'add category column to conversation_stats',
    up: async (pool) => {
      const [cols] = await pool.execute<ColumnInfoRow[]>("SHOW COLUMNS FROM conversation_stats LIKE 'category'");
      if (cols.length === 0) {
        await pool.execute("ALTER TABLE conversation_stats ADD COLUMN category VARCHAR(30) AFTER summary");
      }
    },
  },
  {
    version: 4,
    name: 'add conversation_id to audit_logs',
    up: async (pool) => {
      const [cols] = await pool.execute<ColumnInfoRow[]>("SHOW COLUMNS FROM audit_logs LIKE 'conversation_id'");
      if (cols.length === 0) {
        await pool.execute("ALTER TABLE audit_logs ADD COLUMN conversation_id VARCHAR(64) AFTER workspace_id, ADD INDEX idx_conversation (conversation_id)");
      }
    },
  },
  {
    version: 5,
    name: 'add timeout config to workspaces',
    up: async (pool) => {
      const [cols] = await pool.execute<ColumnInfoRow[]>("SHOW COLUMNS FROM workspaces LIKE 'cold_timeout_minutes'");
      if (cols.length === 0) {
        await pool.execute("ALTER TABLE workspaces ADD COLUMN cold_timeout_minutes INT DEFAULT 30, ADD COLUMN close_timeout_minutes INT DEFAULT 60");
      }
    },
  },
  {
    version: 6,
    name: 'add fraud_indicators to conversation_stats',
    up: async (pool) => {
      const [cols] = await pool.execute<ColumnInfoRow[]>("SHOW COLUMNS FROM conversation_stats LIKE 'fraud_indicators'");
      if (cols.length === 0) {
        await pool.execute("ALTER TABLE conversation_stats ADD COLUMN fraud_indicators JSON AFTER knowledge_gaps");
      }
    },
  },
  {
    version: 7,
    name: 'add models table',
    up: async (pool) => {
      await pool.execute(`
        CREATE TABLE IF NOT EXISTS models (
          id VARCHAR(100) PRIMARY KEY,
          label VARCHAR(255) NOT NULL,
          provider VARCHAR(50) NOT NULL,
          enabled BOOLEAN NOT NULL DEFAULT TRUE,
          is_default BOOLEAN NOT NULL DEFAULT FALSE,
          sort_order INT NOT NULL DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Seed with models across providers. No default set;
      // admin must choose when configuring their AI provider.
      await pool.execute(`
        INSERT IGNORE INTO models (id, label, provider, enabled, sort_order) VALUES
          ('claude-sonnet-4-20250514', 'Claude Sonnet 4', 'anthropic', TRUE, 1),
          ('claude-haiku-4-20250414', 'Claude Haiku 4', 'anthropic', TRUE, 2),
          ('claude-opus-4-20250514', 'Claude Opus 4', 'anthropic', TRUE, 3),
          ('gpt-4o', 'GPT-4o', 'openai', TRUE, 4),
          ('gpt-4o-mini', 'GPT-4o Mini', 'openai', TRUE, 5),
          ('gpt-4.1', 'GPT-4.1', 'openai', TRUE, 6)
      `);
    },
  },
  {
    version: 8,
    name: 'set default ai_provider_type for existing orgs',
    up: async (pool) => {
      // Ensure existing orgs have ai_provider_type set so the provider
      // resolution doesn't throw. New orgs will set this during setup.
      const [orgs] = await pool.execute<mysql.RowDataPacket[]>(
        `SELECT id FROM organisations WHERE id NOT IN (SELECT org_id FROM org_settings WHERE key_name = 'ai_provider_type')`
      );
      for (const org of orgs) {
        await pool.execute(
          `INSERT INTO org_settings (id, org_id, key_name, value, is_secret) VALUES (?, ?, 'ai_provider_type', 'anthropic', 0)`,
          [generateId(), org.id]
        );
      }
    },
  },
  {
    version: 9,
    name: 'add unique constraint on teams (org_id, name)',
    up: async (pool) => {
      // Check if constraint already exists (may have been applied as old migration 8)
      const [rows] = await pool.execute<mysql.RowDataPacket[]>(
        `SELECT COUNT(*) as cnt FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'teams' AND CONSTRAINT_NAME = 'unique_org_team'`
      );
      if (rows[0]?.cnt > 0) return; // Already exists

      await pool.execute(`
        DELETE t1 FROM teams t1
        INNER JOIN teams t2
        WHERE t1.org_id = t2.org_id AND t1.name = t2.name AND t1.created_at > t2.created_at
      `);
      await pool.execute('ALTER TABLE teams ADD UNIQUE KEY unique_org_team (org_id, name)');
    },
  },
  {
    version: 10,
    name: 'input screening fields on audit_logs',
    up: async (pool) => {
      await pool.execute(`
        ALTER TABLE audit_logs
        ADD COLUMN input_screening_action VARCHAR(10) NULL,
        ADD COLUMN input_screening_categories TEXT NULL,
        ADD COLUMN input_screening_ms INT NULL
      `);
    },
  },
  {
    version: 11,
    name: 'workspace guardrails table',
    up: async (pool) => {
      await pool.execute(`
        CREATE TABLE IF NOT EXISTS workspace_guardrails (
          id VARCHAR(64) PRIMARY KEY,
          workspace_id VARCHAR(64) NOT NULL,
          guardrail_id VARCHAR(100) NOT NULL,
          enabled BOOLEAN DEFAULT TRUE,
          config JSON NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY unique_workspace_guardrail (workspace_id, guardrail_id),
          FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        )
      `);
    },
  },
  {
    version: 12,
    name: 'consumer type enum to varchar',
    up: async (pool) => {
      await pool.execute(`ALTER TABLE consumers MODIFY COLUMN type VARCHAR(50) NOT NULL`);
    },
  },
  {
    version: 13,
    name: 'workspace routing layer',
    up: async (pool) => {
      // Default workspace flag
      const [wsCols] = await pool.execute<ColumnInfoRow[]>("SHOW COLUMNS FROM workspaces LIKE 'is_default'");
      if (wsCols.length === 0) {
        await pool.execute(`ALTER TABLE workspaces ADD COLUMN is_default BOOLEAN DEFAULT FALSE`);
      }

      // Routing metadata on conversations
      const [routedCols] = await pool.execute<ColumnInfoRow[]>("SHOW COLUMNS FROM conversations LIKE 'routed_from'");
      if (routedCols.length === 0) {
        await pool.execute(`
          ALTER TABLE conversations
          ADD COLUMN routed_from VARCHAR(64) NULL,
          ADD COLUMN routed_to VARCHAR(64) NULL,
          ADD COLUMN route_reason TEXT NULL
        `);
      }
    },
  },
  {
    version: 14,
    name: 'prompt templates table',
    up: async (pool) => {
      await pool.execute(`
        CREATE TABLE IF NOT EXISTS prompt_templates (
          id VARCHAR(64) PRIMARY KEY,
          prompt_type VARCHAR(50) NOT NULL,
          scope ENUM('system', 'org', 'workspace') NOT NULL,
          scope_id VARCHAR(64),
          content TEXT NOT NULL,
          version INT NOT NULL DEFAULT 1,
          is_active BOOLEAN DEFAULT TRUE,
          is_draft BOOLEAN DEFAULT FALSE,
          created_by VARCHAR(64),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_type_scope (prompt_type, scope, scope_id),
          INDEX idx_active (prompt_type, scope, scope_id, is_active)
        )
      `);
    },
  },
  {
    version: 15,
    name: 'guardrail events table',
    up: async (pool) => {
      await pool.execute(`
        CREATE TABLE IF NOT EXISTS guardrail_events (
          id VARCHAR(64) PRIMARY KEY,
          workspace_id VARCHAR(64) NOT NULL,
          conversation_id VARCHAR(64),
          event_type ENUM('execution_blocked', 'retrieval_stripped') NOT NULL,
          plugin_id VARCHAR(64) NOT NULL,
          tool_name VARCHAR(128),
          original_query TEXT,
          reason TEXT,
          stripped_content TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_workspace (workspace_id, created_at DESC),
          INDEX idx_conversation (conversation_id)
        )
      `);
    },
  },
  {
    version: 16,
    name: 'guardrail events add tool_args and original_content',
    up: async (pool) => {
      await pool.execute(`ALTER TABLE guardrail_events ADD COLUMN tool_args TEXT AFTER tool_name`);
      await pool.execute(`ALTER TABLE guardrail_events ADD COLUMN original_content TEXT AFTER reason`);
    },
  },
  {
    version: 17,
    name: 'guardrail events add connection_name',
    up: async (pool) => {
      await pool.execute(`ALTER TABLE guardrail_events ADD COLUMN connection_name VARCHAR(128) AFTER tool_args`);
    },
  },
];

interface SchemaMigrationRow extends mysql.RowDataPacket {
  version: number;
}

export async function runMigrations(pool: mysql.Pool) {
  log.info('Running migrations...');

  // Ensure schema_migrations tracking table exists
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Fetch already-applied versions
  const [applied] = await pool.execute<SchemaMigrationRow[]>(
    'SELECT version FROM schema_migrations ORDER BY version'
  );
  const appliedVersions = new Set(applied.map((row) => row.version));

  // Run each unapplied migration in order
  const pending = migrations
    .filter((m) => !appliedVersions.has(m.version))
    .sort((a, b) => a.version - b.version);

  if (pending.length === 0) {
    log.info('No pending migrations');
    return;
  }

  for (const migration of pending) {
    log.info({ version: migration.version, name: migration.name }, 'Applying migration');
    try {
      await migration.up(pool);
      await pool.execute(
        'INSERT INTO schema_migrations (version, name) VALUES (?, ?)',
        [migration.version, migration.name]
      );
      log.info({ version: migration.version }, 'Migration applied');
    } catch (err) {
      log.error({ err, version: migration.version, name: migration.name }, 'Migration failed');
      throw err;
    }
  }

  log.info({ applied: pending.length, total: migrations.length }, 'Migrations complete');
}
