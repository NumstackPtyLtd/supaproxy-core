import type { Pool, RowDataPacket } from 'mysql2/promise';
import type { KnowledgeChunkData, KnowledgeChunkRepository } from '../../../domain/knowledge/repository.js';

interface ChunkRow extends RowDataPacket {
  id: string;
  source_id: string;
  workspace_id: string;
  text: string;
  chunk_index: number;
  content_hash: string;
  created_at: string;
}

export class MysqlKnowledgeChunkRepository implements KnowledgeChunkRepository {
  constructor(private pool: Pool) {}

  async createChunks(chunks: KnowledgeChunkData[]): Promise<void> {
    if (chunks.length === 0) return;

    const values = chunks.map(c => [c.id, c.source_id, c.workspace_id, c.text, c.chunk_index, c.content_hash]);
    const placeholders = chunks.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');

    await this.pool.execute(
      `INSERT INTO knowledge_chunks (id, source_id, workspace_id, text, chunk_index, content_hash) VALUES ${placeholders}`,
      values.flat(),
    );
  }

  async findBySource(sourceId: string): Promise<KnowledgeChunkData[]> {
    const [rows] = await this.pool.execute<ChunkRow[]>(
      'SELECT id, source_id, workspace_id, text, chunk_index, content_hash, created_at FROM knowledge_chunks WHERE source_id = ? ORDER BY chunk_index',
      [sourceId],
    );
    return rows;
  }

  async findByWorkspace(workspaceId: string): Promise<KnowledgeChunkData[]> {
    const [rows] = await this.pool.execute<ChunkRow[]>(
      'SELECT id, source_id, workspace_id, text, chunk_index, content_hash, created_at FROM knowledge_chunks WHERE workspace_id = ? ORDER BY source_id, chunk_index',
      [workspaceId],
    );
    return rows;
  }

  async deleteBySource(sourceId: string): Promise<void> {
    await this.pool.execute('DELETE FROM knowledge_chunks WHERE source_id = ?', [sourceId]);
  }

  async deleteByWorkspace(workspaceId: string): Promise<void> {
    await this.pool.execute('DELETE FROM knowledge_chunks WHERE workspace_id = ?', [workspaceId]);
  }

  async countBySource(sourceId: string): Promise<number> {
    const [rows] = await this.pool.execute<(RowDataPacket & { cnt: number })[]>(
      'SELECT COUNT(*) as cnt FROM knowledge_chunks WHERE source_id = ?',
      [sourceId],
    );
    return rows[0].cnt;
  }
}
