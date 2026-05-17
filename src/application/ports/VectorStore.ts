/**
 * Port: vector storage and similarity search.
 * Implemented by LanceDB (or any vector DB).
 */

export interface VectorRecord {
  id: string;
  vector: number[];
  text: string;
  sourceId: string;
  workspaceId: string;
  metadata?: Record<string, string>;
}

export interface VectorSearchResult {
  id: string;
  text: string;
  sourceId: string;
  score: number;
  metadata?: Record<string, string>;
}

export interface VectorStore {
  upsert(workspaceId: string, records: VectorRecord[]): Promise<void>;
  search(workspaceId: string, vector: number[], limit: number): Promise<VectorSearchResult[]>;
  deleteBySource(workspaceId: string, sourceId: string): Promise<void>;
  deleteByWorkspace(workspaceId: string): Promise<void>;
}
