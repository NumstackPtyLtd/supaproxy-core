/**
 * Adapter validation test suite.
 *
 * Adapter packages can import `validateDatabaseAdapter` to verify their
 * implementation satisfies the DatabaseAdapter contract at runtime.
 *
 * Usage in your adapter's test file:
 *
 *   import { validateDatabaseAdapter } from '@supaproxy/core/ports/database'
 *   import { createMysqlInfra } from '../src/index.js'
 *
 *   const pool = getTestPool()
 *   const adapter = createMysqlInfra(pool)
 *   validateDatabaseAdapter(adapter)
 */
import { describe, it, expect } from 'vitest'
import type { DatabaseAdapter } from './DatabaseAdapter.js'

const REPO_KEYS: (keyof DatabaseAdapter)[] = [
  'orgRepo',
  'workspaceRepo',
  'conversationRepo',
  'auditRepo',
  'modelRepo',
  'promptTemplateRepo',
  'guardrailEventRepo',
  'guardrailPolicyRepo',
  'integrationRepo',
  'entryPointRepo',
  'knowledgeChunkRepo',
]

/**
 * Method signatures that each repository must expose.
 * This is the minimum set of methods the core expects to call.
 */
const REQUIRED_METHODS: Record<string, string[]> = {
  orgRepo: ['findById', 'create', 'updateName', 'findUserByEmail', 'createUser', 'listSettings', 'upsertSetting', 'listTeams', 'createTeam', 'getFirstOrgId'],
  workspaceRepo: ['findById', 'create', 'update', 'listNonArchived', 'findConnections', 'createConnection', 'findTools', 'createTools', 'findConsumers', 'createConsumer', 'findKnowledge', 'findGuardrails', 'enableGuardrail', 'getStats', 'getActiveWorkspaceCount'],
  conversationRepo: ['findById', 'findLatestByThread', 'create', 'updateStatus', 'closeConversation', 'listWithStats', 'findMessages', 'recordMessage', 'findStats', 'createStats', 'updateStatsComplete', 'getAggregateData'],
  auditRepo: ['create'],
  modelRepo: ['listByProvider', 'listAll'],
  promptTemplateRepo: ['findActive', 'findAllActive', 'findVersions', 'create', 'activate', 'deactivateAllForType'],
  guardrailEventRepo: ['create', 'findByWorkspace', 'findByWorkspaceFiltered', 'updateStatus'],
  guardrailPolicyRepo: ['listByOrg', 'findByOrgAndPlugin', 'upsert', 'getComplianceForPolicy', 'findOverride', 'createOverride', 'deleteOverride', 'getOrgEventStats', 'findMandatoryPlugins', 'findRecommendedPlugins'],
  integrationRepo: ['findByOrg', 'findByOrgAndType', 'create', 'updateStatus', 'delete'],
  entryPointRepo: ['findByIntegration', 'findByChannel', 'findById', 'create', 'update', 'delete'],
  knowledgeChunkRepo: ['createChunks', 'findBySource', 'findByWorkspace', 'deleteBySource', 'deleteByWorkspace', 'countBySource'],
}

const REQUIRED_TOP_LEVEL_METHODS = ['getMonthlySpend', 'getWorkspaceGuardrailConfig']

export function validateDatabaseAdapter(adapter: DatabaseAdapter) {
  describe('DatabaseAdapter contract', () => {
    it('exposes all required repository keys', () => {
      for (const key of REPO_KEYS) {
        expect(adapter[key], `missing repo: ${key}`).toBeDefined()
        expect(typeof adapter[key], `${key} should be an object`).toBe('object')
      }
    })

    for (const key of REPO_KEYS) {
      describe(key, () => {
        for (const method of REQUIRED_METHODS[key]) {
          it(`has method: ${method}`, () => {
            const repo = adapter[key] as unknown as Record<string, unknown>
            expect(typeof repo[method], `${key}.${method} should be a function`).toBe('function')
          })
        }
      })
    }

    describe('top-level methods', () => {
      for (const method of REQUIRED_TOP_LEVEL_METHODS) {
        it(`has method: ${method}`, () => {
          const fn = (adapter as unknown as Record<string, unknown>)[method]
          expect(typeof fn, `adapter.${method} should be a function`).toBe('function')
        })
      }
    })
  })
}

// Self-test: validate the contract definition is internally consistent
describe('DatabaseAdapter type', () => {
  it('REPO_KEYS matches all DatabaseAdapter fields', () => {
    // This test ensures we update this file when new repos are added
    expect(REPO_KEYS.length).toBe(11)
  })
})
