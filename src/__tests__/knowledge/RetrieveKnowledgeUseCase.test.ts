import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RetrieveKnowledgeUseCase } from '../../application/knowledge/RetrieveKnowledgeUseCase.js';
import type { EmbeddingService } from '../../application/ports/EmbeddingService.js';
import type { VectorStore, VectorSearchResult } from '../../application/ports/VectorStore.js';

function mockEmbeddingService(): EmbeddingService {
  return {
    embed: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
    dimensions: () => 3,
  };
}

function mockVectorStore(results: VectorSearchResult[] = []): VectorStore {
  return {
    upsert: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue(results),
    deleteBySource: vi.fn().mockResolvedValue(undefined),
    deleteByWorkspace: vi.fn().mockResolvedValue(undefined),
  };
}

describe('RetrieveKnowledgeUseCase', () => {
  let embedService: EmbeddingService;

  beforeEach(() => {
    embedService = mockEmbeddingService();
  });

  it('embeds query and searches vector store', async () => {
    const results: VectorSearchResult[] = [
      { id: 'c1', text: 'Refund policy: 5 business days.', sourceId: 'src-1', score: 0.85, metadata: { source_name: 'Refund Policy' } },
    ];
    const store = mockVectorStore(results);
    const useCase = new RetrieveKnowledgeUseCase(store, embedService);

    const result = await useCase.execute('ws-abc', 'How do I get a refund?');

    expect(embedService.embed).toHaveBeenCalledWith(['How do I get a refund?']);
    expect(store.search).toHaveBeenCalledWith('ws-abc', [0.1, 0.2, 0.3], 5);
    expect(result.chunks).toHaveLength(1);
    expect(result.chunks[0].text).toBe('Refund policy: 5 business days.');
    expect(result.query).toBe('How do I get a refund?');
  });

  it('filters out low-score results', async () => {
    const results: VectorSearchResult[] = [
      { id: 'c1', text: 'Relevant chunk', sourceId: 'src-1', score: 0.8 },
      { id: 'c2', text: 'Barely relevant', sourceId: 'src-1', score: 0.35 },
      { id: 'c3', text: 'Irrelevant chunk', sourceId: 'src-2', score: 0.1 },
    ];
    const store = mockVectorStore(results);
    const useCase = new RetrieveKnowledgeUseCase(store, embedService);

    const result = await useCase.execute('ws-abc', 'test query');

    expect(result.chunks).toHaveLength(2);
    expect(result.chunks[0].score).toBe(0.8);
    expect(result.chunks[1].score).toBe(0.35);
  });

  it('returns empty when no chunks exist', async () => {
    const store = mockVectorStore([]);
    const useCase = new RetrieveKnowledgeUseCase(store, embedService);

    const result = await useCase.execute('ws-abc', 'anything');

    expect(result.chunks).toHaveLength(0);
  });

  it('respects custom limit', async () => {
    const store = mockVectorStore([]);
    const useCase = new RetrieveKnowledgeUseCase(store, embedService);

    await useCase.execute('ws-abc', 'test', 10);

    expect(store.search).toHaveBeenCalledWith('ws-abc', expect.any(Array), 10);
  });
});

describe('RetrieveKnowledgeUseCase.formatContext', () => {
  it('formats chunks into prompt context', () => {
    const chunks: VectorSearchResult[] = [
      { id: 'c1', text: 'Customers may return goods within 5 days.', sourceId: 'src-1', score: 0.9, metadata: { source_name: 'Refund Policy' } },
      { id: 'c2', text: 'Cooling-off period under CPA s.16.', sourceId: 'src-2', score: 0.7, metadata: { source_name: 'CPA Regulations' } },
    ];

    const context = RetrieveKnowledgeUseCase.formatContext(chunks);

    expect(context).toContain('<knowledge_context>');
    expect(context).toContain('[1] (Refund Policy) Customers may return goods within 5 days.');
    expect(context).toContain('[2] (CPA Regulations) Cooling-off period under CPA s.16.');
    expect(context).toContain('</knowledge_context>');
  });

  it('returns empty string for no chunks', () => {
    expect(RetrieveKnowledgeUseCase.formatContext([])).toBe('');
  });

  it('uses fallback source name when metadata missing', () => {
    const chunks: VectorSearchResult[] = [
      { id: 'c1', text: 'Some text.', sourceId: 'src-1', score: 0.8 },
    ];

    const context = RetrieveKnowledgeUseCase.formatContext(chunks);
    expect(context).toContain('[1] (Knowledge base) Some text.');
  });
});
