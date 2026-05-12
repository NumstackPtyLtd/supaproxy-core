import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PromptResolver } from './PromptResolver.js'
import type { PromptTemplateRepository, PromptTemplateData } from '../../domain/prompt/repository.js'
import { DEFAULT_OUT_OF_SCOPE_MESSAGE } from '../../prompts.js'

function mockPromptRepo(): PromptTemplateRepository {
  return {
    findActive: vi.fn().mockResolvedValue(null),
    findAllActive: vi.fn().mockResolvedValue([]),
    findVersions: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue(undefined),
    activate: vi.fn().mockResolvedValue(undefined),
    deactivateAllForType: vi.fn().mockResolvedValue(undefined),
  }
}

function stubPrompt(overrides: Partial<PromptTemplateData> = {}): PromptTemplateData {
  return {
    id: 'prompt-1',
    prompt_type: 'out_of_scope_message',
    scope: 'org',
    scope_id: 'org-1',
    content: 'Custom prompt content',
    version: 1,
    is_active: true,
    is_draft: false,
    created_by: 'user-1',
    created_at: '2026-05-12',
    ...overrides,
  }
}

describe('PromptResolver', () => {
  let repo: ReturnType<typeof mockPromptRepo>
  let resolver: PromptResolver

  beforeEach(() => {
    repo = mockPromptRepo()
    resolver = new PromptResolver(repo)
  })

  describe('three-tier resolution', () => {
    it('returns system default when no overrides exist', async () => {
      const result = await resolver.resolve('out_of_scope_message', 'org-1')

      expect(result).toBe(DEFAULT_OUT_OF_SCOPE_MESSAGE)
      expect(repo.findActive).toHaveBeenCalledWith('out_of_scope_message', 'org', 'org-1')
    })

    it('returns org override when it exists', async () => {
      vi.mocked(repo.findActive).mockResolvedValueOnce(
        stubPrompt({ content: 'Org-level custom message' })
      )

      const result = await resolver.resolve('out_of_scope_message', 'org-1')

      expect(result).toBe('Org-level custom message')
    })

    it('returns workspace override over org override', async () => {
      // First call: workspace lookup
      vi.mocked(repo.findActive).mockResolvedValueOnce(
        stubPrompt({ scope: 'workspace', scope_id: 'ws-1', content: 'Workspace-level message' })
      )
      // Second call would be org, but should not be reached
      vi.mocked(repo.findActive).mockResolvedValueOnce(
        stubPrompt({ content: 'Org-level message' })
      )

      const result = await resolver.resolve('out_of_scope_message', 'org-1', 'ws-1')

      expect(result).toBe('Workspace-level message')
      // Should only have called findActive once (workspace hit, no org lookup needed)
      expect(repo.findActive).toHaveBeenCalledTimes(1)
      expect(repo.findActive).toHaveBeenCalledWith('out_of_scope_message', 'workspace', 'ws-1')
    })

    it('falls through to org when workspace override does not exist', async () => {
      // First call: workspace lookup, not found
      vi.mocked(repo.findActive).mockResolvedValueOnce(null)
      // Second call: org lookup, found
      vi.mocked(repo.findActive).mockResolvedValueOnce(
        stubPrompt({ content: 'Org fallback' })
      )

      const result = await resolver.resolve('out_of_scope_message', 'org-1', 'ws-1')

      expect(result).toBe('Org fallback')
      expect(repo.findActive).toHaveBeenCalledTimes(2)
    })

    it('falls through to system default when neither workspace nor org override exists', async () => {
      vi.mocked(repo.findActive).mockResolvedValue(null)

      const result = await resolver.resolve('out_of_scope_message', 'org-1', 'ws-1')

      expect(result).toBe(DEFAULT_OUT_OF_SCOPE_MESSAGE)
      expect(repo.findActive).toHaveBeenCalledTimes(2) // workspace + org
    })

    it('skips workspace lookup when no workspaceId provided', async () => {
      vi.mocked(repo.findActive).mockResolvedValue(null)

      await resolver.resolve('scope_enforcement', 'org-1')

      expect(repo.findActive).toHaveBeenCalledTimes(1) // org only
      expect(repo.findActive).toHaveBeenCalledWith('scope_enforcement', 'org', 'org-1')
    })
  })

  describe('system defaults', () => {
    it('returns scope enforcement clause for scope_enforcement type', async () => {
      vi.mocked(repo.findActive).mockResolvedValue(null)

      const result = await resolver.resolve('scope_enforcement', 'org-1')

      expect(result).toContain('SCOPE RULE')
      expect(result).toContain('MANDATORY')
    })

    it('returns out of scope message for out_of_scope_message type', async () => {
      vi.mocked(repo.findActive).mockResolvedValue(null)

      const result = await resolver.resolve('out_of_scope_message', 'org-1')

      expect(result).toContain('connect you with someone')
    })

    it('returns cold fallback for cold_message type', async () => {
      vi.mocked(repo.findActive).mockResolvedValue(null)

      const result = await resolver.resolve('cold_message', 'org-1')

      expect(result).toContain('checking in')
    })

    it('returns empty string for types without system defaults', async () => {
      vi.mocked(repo.findActive).mockResolvedValue(null)

      expect(await resolver.resolve('receptionist', 'org-1')).toBe('')
      expect(await resolver.resolve('agent_intro', 'org-1')).toBe('')
      expect(await resolver.resolve('analysis', 'org-1')).toBe('')
      expect(await resolver.resolve('system_prompt', 'org-1')).toBe('')
    })
  })

  describe('draft prompts are not returned', () => {
    it('findActive only returns non-draft active prompts', async () => {
      // The repo.findActive contract should only return is_active=true, is_draft=false
      // This test documents the expected contract
      vi.mocked(repo.findActive).mockResolvedValue(
        stubPrompt({ is_draft: true, content: 'Draft content' })
      )

      // Even if repo returns a draft (shouldn't happen with correct query),
      // the resolver should still return it because filtering is the repo's job
      const result = await resolver.resolve('out_of_scope_message', 'org-1')
      expect(result).toBe('Draft content')
      // This test exists to document that draft filtering is at the repo layer, not resolver
    })
  })
})
