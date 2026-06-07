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

/** A knowledge gap captured live, the moment the assistant could not answer. */
export interface KnowledgeGapRecord {
  id: string;
  workspaceId: string;
  conversationId: string | null;
  topic: string;
  missingInformation: string;
  sourcesChecked: string[];
  gapDetail: string;
  userName: string | null;
}

/** A gap in the shape the gaps API and dashboard consume. */
export interface AggregatedKnowledgeGap {
  topic: string;
  missing_information: string;
  sources_checked: string[];
  gap_detail: string;
  conversation_id: string | null;
  user_name: string | null;
  timestamp: string;
}

export interface KnowledgeGapRepository {
  /** Persist a gap captured during a query. */
  create(record: KnowledgeGapRecord): Promise<void>;
  /** Most recent live gaps for a workspace. */
  listByWorkspace(workspaceId: string, limit: number): Promise<AggregatedKnowledgeGap[]>;
}
