/**
 * Domain: knowledge chunk metadata storage.
 * Chunks are the indexed units of knowledge. Vectors live in VectorStore.
 */

export interface KnowledgeChunkData {
  id: string;
  source_id: string;
  workspace_id: string;
  text: string;
  chunk_index: number;
  content_hash: string;
  created_at: string;
}

export interface KnowledgeChunkRepository {
  createChunks(chunks: KnowledgeChunkData[]): Promise<void>;
  findBySource(sourceId: string): Promise<KnowledgeChunkData[]>;
  findByWorkspace(workspaceId: string): Promise<KnowledgeChunkData[]>;
  deleteBySource(sourceId: string): Promise<void>;
  deleteByWorkspace(workspaceId: string): Promise<void>;
  countBySource(sourceId: string): Promise<number>;
}
