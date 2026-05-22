import { describe, it, expect } from 'vitest'
import { Workspace } from './Workspace.js'
import { WorkspaceStatus } from './WorkspaceStatus.js'

function makeWorkspace(overrides: Partial<Parameters<typeof Workspace.fromData>[0]> = {}) {
  return Workspace.fromData({
    id: 'ws-test', org_id: 'org-1', team_id: 'team-1', name: 'Test Workspace',
    status: WorkspaceStatus.ACTIVE, model: 'claude-sonnet-4-20250514', provider_type: null,
    system_prompt: 'You are helpful.', max_tool_rounds: 10, max_thread_history: 50,
    cold_timeout_minutes: 30, close_timeout_minutes: 60, is_default: false,
    created_by: 'user-1', created_at: '2024-01-01', updated_at: '2024-01-01',
    ...overrides,
  })
}

describe('Workspace', () => {
  describe('isActive', () => {
    it('returns true for active workspaces', () => {
      expect(makeWorkspace().isActive()).toBe(true)
    })

    it('returns false for paused workspaces', () => {
      expect(makeWorkspace({ status: WorkspaceStatus.PAUSED }).isActive()).toBe(false)
    })

    it('returns false for archived workspaces', () => {
      expect(makeWorkspace({ status: WorkspaceStatus.ARCHIVED }).isActive()).toBe(false)
    })
  })

  describe('canDelete', () => {
    it('returns true for non-default workspaces', () => {
      expect(makeWorkspace({ is_default: false }).canDelete()).toBe(true)
    })

    it('returns false for default (published) workspaces', () => {
      expect(makeWorkspace({ is_default: true }).canDelete()).toBe(false)
    })
  })

  describe('pause', () => {
    it('transitions active to paused', () => {
      const ws = makeWorkspace({ status: WorkspaceStatus.ACTIVE })
      ws.pause()
      expect(ws.status).toBe(WorkspaceStatus.PAUSED)
    })

    it('throws when already paused', () => {
      const ws = makeWorkspace({ status: WorkspaceStatus.PAUSED })
      expect(() => ws.pause()).toThrow('Cannot transition from paused to paused')
    })

    it('throws when archived', () => {
      const ws = makeWorkspace({ status: WorkspaceStatus.ARCHIVED })
      expect(() => ws.pause()).toThrow('Cannot transition from archived to paused')
    })
  })

  describe('activate', () => {
    it('transitions paused to active', () => {
      const ws = makeWorkspace({ status: WorkspaceStatus.PAUSED })
      ws.activate()
      expect(ws.status).toBe(WorkspaceStatus.ACTIVE)
    })

    it('is idempotent for active workspaces', () => {
      const ws = makeWorkspace({ status: WorkspaceStatus.ACTIVE })
      ws.activate()
      expect(ws.status).toBe(WorkspaceStatus.ACTIVE)
    })

    it('throws when archived', () => {
      const ws = makeWorkspace({ status: WorkspaceStatus.ARCHIVED })
      expect(() => ws.activate()).toThrow('Cannot transition from archived to active')
    })
  })

  describe('archive', () => {
    it('transitions active to archived', () => {
      const ws = makeWorkspace({ status: WorkspaceStatus.ACTIVE })
      ws.archive()
      expect(ws.status).toBe(WorkspaceStatus.ARCHIVED)
    })

    it('transitions paused to archived', () => {
      const ws = makeWorkspace({ status: WorkspaceStatus.PAUSED })
      ws.archive()
      expect(ws.status).toBe(WorkspaceStatus.ARCHIVED)
    })

    it('is idempotent for archived workspaces', () => {
      const ws = makeWorkspace({ status: WorkspaceStatus.ARCHIVED })
      ws.archive()
      expect(ws.status).toBe(WorkspaceStatus.ARCHIVED)
    })
  })

  describe('properties', () => {
    it('exposes id, name, and isDefault', () => {
      const ws = makeWorkspace({ id: 'ws-42', name: 'My Workspace', is_default: true })
      expect(ws.id).toBe('ws-42')
      expect(ws.name).toBe('My Workspace')
      expect(ws.isDefault).toBe(true)
    })
  })
})
