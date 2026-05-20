import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { VectorRecord } from '../../application/ports/VectorStore.js'

// Use vi.hoisted so these are available when vi.mock factory runs (hoisted to top)
const { mockTable, mockSearchChain, mockDb } = vi.hoisted(() => {
  const mockSearchChain = {
    limit: vi.fn().mockReturnThis(),
    toArray: vi.fn().mockResolvedValue([]),
  }

  const mockTable = {
    add: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    vectorSearch: vi.fn().mockReturnValue(mockSearchChain),
  }

  const mockDb = {
    tableNames: vi.fn().mockResolvedValue([]),
    openTable: vi.fn().mockResolvedValue(mockTable),
    createTable: vi.fn().mockResolvedValue(mockTable),
    dropTable: vi.fn().mockResolvedValue(undefined),
  }

  return { mockTable, mockSearchChain, mockDb }
})

vi.mock('@lancedb/lancedb', () => ({
  connect: vi.fn().mockResolvedValue(mockDb),
}))

vi.mock('pino', () => ({
  default: () => ({
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  }),
}))

import { LanceDBVectorStore } from './LanceDBVectorStore.js'

function makeRecord(overrides: Partial<VectorRecord> = {}): VectorRecord {
  return {
    id: 'vec-1',
    vector: [0.1, 0.2, 0.3],
    text: 'sample text',
    sourceId: 'src-1',
    workspaceId: 'ws-1',
    ...overrides,
  }
}

describe('LanceDBVectorStore', () => {
  let store: LanceDBVectorStore

  beforeEach(() => {
    store = new LanceDBVectorStore('/tmp/test-lancedb')
    vi.clearAllMocks()
    // Reset defaults
    mockDb.tableNames.mockResolvedValue([])
    mockDb.openTable.mockResolvedValue(mockTable)
    mockTable.vectorSearch.mockReturnValue(mockSearchChain)
    mockSearchChain.limit.mockReturnThis()
    mockSearchChain.toArray.mockResolvedValue([])
  })

  describe('upsert', () => {
    it('does nothing for empty records array', async () => {
      await store.upsert('ws-1', [])

      expect(mockDb.tableNames).not.toHaveBeenCalled()
    })

    it('creates a new table when it does not exist', async () => {
      mockDb.tableNames.mockResolvedValue([])
      const record = makeRecord()

      await store.upsert('ws-1', [record])

      expect(mockDb.createTable).toHaveBeenCalledWith(
        'ws_ws_1',
        expect.arrayContaining([
          expect.objectContaining({
            id: 'vec-1',
            text: 'sample text',
            source_id: 'src-1',
            workspace_id: 'ws-1',
          }),
        ]),
      )
    })

    it('adds to existing table and deletes old records by source', async () => {
      mockDb.tableNames.mockResolvedValue(['ws_ws_1'])
      mockTable.delete.mockResolvedValue(undefined)
      const record = makeRecord()

      await store.upsert('ws-1', [record])

      expect(mockDb.openTable).toHaveBeenCalledWith('ws_ws_1')
      expect(mockTable.delete).toHaveBeenCalledWith("source_id = 'src-1'")
      expect(mockTable.add).toHaveBeenCalled()
    })

    it('serialises metadata to JSON string', async () => {
      mockDb.tableNames.mockResolvedValue([])
      const record = makeRecord({ metadata: { key: 'value' } })

      await store.upsert('ws-1', [record])

      const rows = mockDb.createTable.mock.calls[0][1]
      expect(rows[0].metadata_json).toBe('{"key":"value"}')
    })

    it('defaults metadata_json to empty object string', async () => {
      mockDb.tableNames.mockResolvedValue([])
      const record = makeRecord({ metadata: undefined })

      await store.upsert('ws-1', [record])

      const rows = mockDb.createTable.mock.calls[0][1]
      expect(rows[0].metadata_json).toBe('{}')
    })

    it('sanitises workspace ID in table name', async () => {
      mockDb.tableNames.mockResolvedValue([])
      const record = makeRecord({ workspaceId: 'ws-special!@#chars' })

      await store.upsert('ws-special!@#chars', [record])

      expect(mockDb.createTable).toHaveBeenCalledWith(
        'ws_ws_special___chars',
        expect.any(Array),
      )
    })
  })

  describe('search', () => {
    it('returns empty array when table does not exist', async () => {
      mockDb.tableNames.mockResolvedValue([])

      const results = await store.search('ws-1', [0.1, 0.2], 5)

      expect(results).toEqual([])
    })

    it('returns mapped results with score', async () => {
      mockDb.tableNames.mockResolvedValue(['ws_ws_1'])
      mockSearchChain.toArray.mockResolvedValue([
        {
          id: 'vec-1',
          text: 'hello',
          source_id: 'src-1',
          metadata_json: '{"tag":"test"}',
          _distance: 0.5,
        },
      ])

      const results = await store.search('ws-1', [0.1, 0.2], 5)

      expect(results).toHaveLength(1)
      expect(results[0]).toEqual({
        id: 'vec-1',
        text: 'hello',
        sourceId: 'src-1',
        score: 1 / (1 + 0.5),
        metadata: { tag: 'test' },
      })
      expect(mockTable.vectorSearch).toHaveBeenCalledWith([0.1, 0.2])
      expect(mockSearchChain.limit).toHaveBeenCalledWith(5)
    })

    it('skips records with invalid metadata JSON', async () => {
      mockDb.tableNames.mockResolvedValue(['ws_ws_1'])
      mockSearchChain.toArray.mockResolvedValue([
        { id: 'vec-1', text: 'good', source_id: 'src-1', metadata_json: '{"ok":"yes"}', _distance: 0 },
        { id: 'vec-2', text: 'bad', source_id: 'src-2', metadata_json: 'INVALID', _distance: 0 },
      ])

      const results = await store.search('ws-1', [0.1], 10)

      expect(results).toHaveLength(1)
      expect(results[0].id).toBe('vec-1')
    })

    it('handles null _distance with score 0', async () => {
      mockDb.tableNames.mockResolvedValue(['ws_ws_1'])
      mockSearchChain.toArray.mockResolvedValue([
        { id: 'vec-1', text: 'hello', source_id: 'src-1', _distance: null },
      ])

      const results = await store.search('ws-1', [0.1], 5)

      expect(results[0].score).toBe(0)
    })
  })

  describe('deleteBySource', () => {
    it('does nothing when table does not exist', async () => {
      mockDb.tableNames.mockResolvedValue([])

      await store.deleteBySource('ws-1', 'src-1')

      expect(mockDb.openTable).not.toHaveBeenCalled()
    })

    it('deletes records matching the source ID', async () => {
      mockDb.tableNames.mockResolvedValue(['ws_ws_1'])
      mockTable.delete.mockResolvedValue(undefined)

      await store.deleteBySource('ws-1', 'src-1')

      expect(mockTable.delete).toHaveBeenCalledWith("source_id = 'src-1'")
    })

    it('handles delete errors gracefully', async () => {
      mockDb.tableNames.mockResolvedValue(['ws_ws_1'])
      mockTable.delete.mockRejectedValue(new Error('delete failed'))

      // Should not throw
      await store.deleteBySource('ws-1', 'src-1')
    })
  })

  describe('deleteByWorkspace', () => {
    it('does nothing when table does not exist', async () => {
      mockDb.tableNames.mockResolvedValue([])

      await store.deleteByWorkspace('ws-1')

      expect(mockDb.dropTable).not.toHaveBeenCalled()
    })

    it('drops the table when it exists', async () => {
      mockDb.tableNames.mockResolvedValue(['ws_ws_1'])

      await store.deleteByWorkspace('ws-1')

      expect(mockDb.dropTable).toHaveBeenCalledWith('ws_ws_1')
    })
  })
})
