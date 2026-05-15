import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IndexKnowledgeUseCase } from '../../application/knowledge/IndexKnowledgeUseCase.js';
import type { KnowledgeChunkRepository, KnowledgeChunkData } from '../../domain/knowledge/repository.js';
import type { EmbeddingService } from '../../application/ports/EmbeddingService.js';
import type { VectorStore, VectorRecord } from '../../application/ports/VectorStore.js';

function mockChunkRepo(): KnowledgeChunkRepository {
  return {
    createChunks: vi.fn().mockResolvedValue(undefined),
    findBySource: vi.fn().mockResolvedValue([]),
    findByWorkspace: vi.fn().mockResolvedValue([]),
    deleteBySource: vi.fn().mockResolvedValue(undefined),
    deleteByWorkspace: vi.fn().mockResolvedValue(undefined),
    countBySource: vi.fn().mockResolvedValue(0),
  };
}

function mockEmbeddingService(dims = 3): EmbeddingService {
  return {
    embed: vi.fn().mockImplementation((texts: string[]) =>
      Promise.resolve(texts.map(() => Array.from({ length: dims }, () => Math.random())))
    ),
    dimensions: () => dims,
  };
}

function mockVectorStore(): VectorStore {
  return {
    upsert: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue([]),
    deleteBySource: vi.fn().mockResolvedValue(undefined),
    deleteByWorkspace: vi.fn().mockResolvedValue(undefined),
  };
}

describe('IndexKnowledgeUseCase', () => {
  let chunkRepo: KnowledgeChunkRepository;
  let embedService: EmbeddingService;
  let vectorStore: VectorStore;
  let useCase: IndexKnowledgeUseCase;

  beforeEach(() => {
    chunkRepo = mockChunkRepo();
    embedService = mockEmbeddingService();
    vectorStore = mockVectorStore();
    useCase = new IndexKnowledgeUseCase(chunkRepo, vectorStore, embedService);
  });

  it('indexes a short text as a single chunk', async () => {
    const result = await useCase.execute({
      id: 'src-1',
      workspaceId: 'ws-abc',
      type: 'inline',
      name: 'Refund policy',
      content: 'Customers may return goods within 5 business days.',
    });

    expect(result.chunksIndexed).toBe(1);
    expect(chunkRepo.deleteBySource).toHaveBeenCalledWith('src-1');
    expect(vectorStore.deleteBySource).toHaveBeenCalledWith('ws-abc', 'src-1');
    expect(embedService.embed).toHaveBeenCalledTimes(1);
    expect(chunkRepo.createChunks).toHaveBeenCalledTimes(1);
    expect(vectorStore.upsert).toHaveBeenCalledTimes(1);

    const storedChunks = (chunkRepo.createChunks as ReturnType<typeof vi.fn>).mock.calls[0][0] as KnowledgeChunkData[];
    expect(storedChunks).toHaveLength(1);
    expect(storedChunks[0].source_id).toBe('src-1');
    expect(storedChunks[0].workspace_id).toBe('ws-abc');
    expect(storedChunks[0].chunk_index).toBe(0);
    expect(storedChunks[0].text).toBe('Customers may return goods within 5 business days.');

    const vectorRecords = (vectorStore.upsert as ReturnType<typeof vi.fn>).mock.calls[0][1] as VectorRecord[];
    expect(vectorRecords).toHaveLength(1);
    expect(vectorRecords[0].sourceId).toBe('src-1');
    expect(vectorRecords[0].metadata?.source_name).toBe('Refund policy');
  });

  it('splits long text into multiple chunks', async () => {
    // Generate text with 600 words (exceeds 500 word chunk size)
    const words = Array.from({ length: 600 }, (_, i) => `word${i}`);
    const content = words.join(' ');

    const result = await useCase.execute({
      id: 'src-2',
      workspaceId: 'ws-abc',
      type: 'inline',
      name: 'Long document',
      content,
    });

    expect(result.chunksIndexed).toBe(2);

    const embeddedTexts = (embedService.embed as ReturnType<typeof vi.fn>).mock.calls[0][0] as string[];
    expect(embeddedTexts).toHaveLength(2);
    // First chunk has 500 words
    expect(embeddedTexts[0].split(' ')).toHaveLength(500);
    // Second chunk starts at 500-50=450, takes remaining 150 words
    expect(embeddedTexts[1].split(' ').length).toBeGreaterThan(0);
  });

  it('returns 0 chunks for empty content', async () => {
    const result = await useCase.execute({
      id: 'src-3',
      workspaceId: 'ws-abc',
      type: 'inline',
      name: 'Empty',
      content: '   ',
    });

    expect(result.chunksIndexed).toBe(0);
    expect(embedService.embed).not.toHaveBeenCalled();
    expect(chunkRepo.createChunks).not.toHaveBeenCalled();
  });

  it('clears old chunks before re-indexing', async () => {
    await useCase.execute({
      id: 'src-4',
      workspaceId: 'ws-abc',
      type: 'inline',
      name: 'Updated policy',
      content: 'New content after update.',
    });

    expect(chunkRepo.deleteBySource).toHaveBeenCalledWith('src-4');
    expect(vectorStore.deleteBySource).toHaveBeenCalledWith('ws-abc', 'src-4');

    // Then creates new chunks
    expect(chunkRepo.createChunks).toHaveBeenCalledTimes(1);
    expect(vectorStore.upsert).toHaveBeenCalledTimes(1);
  });

  it('generates unique content hashes per chunk', async () => {
    const words = Array.from({ length: 600 }, (_, i) => `word${i}`);

    await useCase.execute({
      id: 'src-5',
      workspaceId: 'ws-abc',
      type: 'inline',
      name: 'Doc',
      content: words.join(' '),
    });

    const storedChunks = (chunkRepo.createChunks as ReturnType<typeof vi.fn>).mock.calls[0][0] as KnowledgeChunkData[];
    const hashes = storedChunks.map(c => c.content_hash);
    const uniqueHashes = new Set(hashes);
    expect(uniqueHashes.size).toBe(hashes.length);
  });

  it('passes correct metadata to vector records', async () => {
    await useCase.execute({
      id: 'src-6',
      workspaceId: 'ws-xyz',
      type: 'confluence',
      name: 'CPA Cooling-off Policy',
      content: 'The consumer may return goods within 5 business days of delivery.',
    });

    const vectorRecords = (vectorStore.upsert as ReturnType<typeof vi.fn>).mock.calls[0][1] as VectorRecord[];
    expect(vectorRecords[0].metadata).toEqual({
      source_name: 'CPA Cooling-off Policy',
      source_type: 'confluence',
      chunk_index: '0',
    });
    expect(vectorRecords[0].workspaceId).toBe('ws-xyz');
  });
});
