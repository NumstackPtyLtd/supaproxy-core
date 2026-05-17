import * as lancedb from '@lancedb/lancedb';
import type { VectorStore, VectorRecord, VectorSearchResult } from '../../application/ports/VectorStore.js';
import pino from 'pino';

const log = pino({ name: 'vector-store' });

/**
 * LanceDB-backed vector store.
 * One table per workspace for isolation.
 * File-based, embedded, no separate server needed.
 */
export class LanceDBVectorStore implements VectorStore {
  private db: lancedb.Connection | null = null;
  private dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  private async getDb(): Promise<lancedb.Connection> {
    if (!this.db) {
      this.db = await lancedb.connect(this.dbPath);
    }
    return this.db;
  }

  private tableName(workspaceId: string): string {
    return `ws_${workspaceId.replace(/[^a-zA-Z0-9_]/g, '_')}`;
  }

  async upsert(workspaceId: string, records: VectorRecord[]): Promise<void> {
    if (records.length === 0) return;

    const db = await this.getDb();
    const name = this.tableName(workspaceId);

    const rows = records.map(r => ({
      id: r.id,
      vector: r.vector,
      text: r.text,
      source_id: r.sourceId,
      workspace_id: r.workspaceId,
      metadata_json: r.metadata ? JSON.stringify(r.metadata) : '{}',
    }));

    const tableNames = await db.tableNames();
    if (tableNames.includes(name)) {
      const table = await db.openTable(name);
      // Delete existing records for the same sources to avoid duplicates
      const sourceIds = [...new Set(records.map(r => r.sourceId))];
      for (const sourceId of sourceIds) {
        try {
          await table.delete(`source_id = '${sourceId}'`);
        } catch (err) {
          log.warn({ err }, 'Failed to delete vectors');
        }
      }
      await table.add(rows);
    } else {
      await db.createTable(name, rows);
    }
  }

  async search(workspaceId: string, vector: number[], limit: number): Promise<VectorSearchResult[]> {
    const db = await this.getDb();
    const name = this.tableName(workspaceId);

    const tableNames = await db.tableNames();
    if (!tableNames.includes(name)) return [];

    const table = await db.openTable(name);
    const results = await table
      .vectorSearch(vector)
      .limit(limit)
      .toArray();

    const mapped: VectorSearchResult[] = [];
    for (const r of results) {
      let metadata: Record<string, string> | undefined;
      if (r.metadata_json) {
        try {
          metadata = JSON.parse(r.metadata_json as string) as Record<string, string>;
        } catch (err) {
          log.warn({ err, id: r.id }, 'Skipping vector record with invalid metadata JSON');
          continue;
        }
      }
      mapped.push({
        id: r.id as string,
        text: r.text as string,
        sourceId: r.source_id as string,
        score: r._distance != null ? 1 / (1 + (r._distance as number)) : 0,
        metadata,
      });
    }
    return mapped;
  }

  async deleteBySource(workspaceId: string, sourceId: string): Promise<void> {
    const db = await this.getDb();
    const name = this.tableName(workspaceId);

    const tableNames = await db.tableNames();
    if (!tableNames.includes(name)) return;

    const table = await db.openTable(name);
    try {
      await table.delete(`source_id = '${sourceId}'`);
    } catch (err) {
      log.warn({ err }, 'Failed to delete vectors by source');
    }
  }

  async deleteByWorkspace(workspaceId: string): Promise<void> {
    const db = await this.getDb();
    const name = this.tableName(workspaceId);

    const tableNames = await db.tableNames();
    if (!tableNames.includes(name)) return;

    await db.dropTable(name);
  }
}
