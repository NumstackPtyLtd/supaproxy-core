import { describe, it, expect, vi } from 'vitest'
import { mockOrgRepo } from '../../__tests__/mocks.js'
import { ListOrgUsersUseCase } from './ListOrgUsersUseCase.js'

describe('ListOrgUsersUseCase', () => {
  function setup() {
    const orgRepo = mockOrgRepo()
    const useCase = new ListOrgUsersUseCase(orgRepo)
    return { orgRepo, useCase }
  }

  it('execute returns users list', async () => {
    const { orgRepo, useCase } = setup()
    const users = [
      { id: 'u-1', name: 'Alice', email: 'alice@acme.com', org_role: 'admin', created_at: '2024-01-01' },
      { id: 'u-2', name: 'Bob', email: 'bob@acme.com', org_role: 'user', created_at: '2024-01-02' },
    ]
    vi.mocked(orgRepo.listUsers).mockResolvedValue({ users, total: 2 })

    const result = await useCase.execute('org-1')

    expect(orgRepo.listUsers).toHaveBeenCalledWith('org-1', {})
    expect(result.users).toEqual(users)
    expect(result.total).toBe(2)
  })

  it('passes search and pagination params', async () => {
    const { orgRepo, useCase } = setup()
    vi.mocked(orgRepo.listUsers).mockResolvedValue({ users: [], total: 0 })

    await useCase.execute('org-1', { search: 'alice', limit: 20, offset: 0 })

    expect(orgRepo.listUsers).toHaveBeenCalledWith('org-1', { search: 'alice', limit: 20, offset: 0 })
  })

  it('returns empty when no users match search', async () => {
    const { orgRepo, useCase } = setup()
    vi.mocked(orgRepo.listUsers).mockResolvedValue({ users: [], total: 0 })

    const result = await useCase.execute('org-1', { search: 'nonexistent' })

    expect(result.users).toEqual([])
    expect(result.total).toBe(0)
  })
})
