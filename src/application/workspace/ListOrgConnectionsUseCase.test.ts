import { describe, it, expect, vi } from 'vitest'
import { ListOrgConnectionsUseCase } from './ListOrgConnectionsUseCase.js'
import type { WorkspaceRepository } from '../../domain/workspace/repository.js'

describe('ListOrgConnectionsUseCase', () => {
  const mockResult = { connections: [], tools: [], total: 0 }
  const repo = { listOrgConnections: vi.fn().mockResolvedValue(mockResult) } as unknown as WorkspaceRepository

  it('delegates to repository with correct params', async () => {
    const uc = new ListOrgConnectionsUseCase(repo)
    const result = await uc.execute('org-1', { search: 'mcp', limit: 20, offset: 0 })
    expect(repo.listOrgConnections).toHaveBeenCalledWith('org-1', { search: 'mcp', limit: 20, offset: 0 })
    expect(result).toEqual(mockResult)
  })
})
