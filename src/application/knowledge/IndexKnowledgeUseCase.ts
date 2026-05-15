import { createHash } from 'crypto';
import { generateId } from '../../domain/shared/EntityId.js';
import type { KnowledgeChunkRepository, KnowledgeChunkData } from '../../domain/knowledge/repository.js';
import type { EmbeddingService } from '../ports/EmbeddingService.js';
import type { VectorStore, VectorRecord } from '../ports/VectorStore.js';

interface KnowledgeSourceInput {
  id: string;
  workspaceId: string;
  type: string;
  name: string;
  content: string;
}

interface IndexResult {
  sourceId: string;
  chunksIndexed: number;
}

import { DEFAULT_CHUNK_SIZE, DEFAULT_CHUNK_OVERLAP } from '../../defaults.js';

function chunkText(text: string, chunkSize = DEFAULT_CHUNK_SIZE, overlap = DEFAULT_CHUNK_OVERLAP): string[] {
  const words = text.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return [];
  if (words.length <= chunkSize) return [words.join(' ')];

  const chunks: string[] = [];
  let start = 0;
  while (start < words.length) {
    const end = Math.min(start + chunkSize, words.length);
    chunks.push(words.slice(start, end).join(' '));
    if (end >= words.length) break;
    start += chunkSize - overlap;
  }
  return chunks;
}

function contentHash(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

export class IndexKnowledgeUseCase {
  constructor(
    private chunkRepo: KnowledgeChunkRepository,
    private vectorStore: VectorStore,
    private embeddingService: EmbeddingService,
  ) {}

  async execute(source: KnowledgeSourceInput): Promise<IndexResult> {
    const { id: sourceId, workspaceId, content } = source;

    // 1. Chunk the content
    const textChunks = chunkText(content);
    if (textChunks.length === 0) {
      return { sourceId, chunksIndexed: 0 };
    }

    // 2. Clear old chunks for this source
    await this.chunkRepo.deleteBySource(sourceId);
    await this.vectorStore.deleteBySource(workspaceId, sourceId);

    // 3. Embed all chunks
    const vectors = await this.embeddingService.embed(textChunks);

    // 4. Build chunk metadata and vector records
    const chunkData: KnowledgeChunkData[] = [];
    const vectorRecords: VectorRecord[] = [];

    for (let i = 0; i < textChunks.length; i++) {
      const chunkId = generateId();
      const text = textChunks[i];

      chunkData.push({
        id: chunkId,
        source_id: sourceId,
        workspace_id: workspaceId,
        text,
        chunk_index: i,
        content_hash: contentHash(text),
        created_at: new Date().toISOString(),
      });

      vectorRecords.push({
        id: chunkId,
        vector: vectors[i],
        text,
        sourceId,
        workspaceId,
        metadata: { source_name: source.name, source_type: source.type, chunk_index: String(i) },
      });
    }

    // 5. Store metadata in MySQL, vectors in LanceDB
    await this.chunkRepo.createChunks(chunkData);
    await this.vectorStore.upsert(workspaceId, vectorRecords);

    return { sourceId, chunksIndexed: textChunks.length };
  }
}
