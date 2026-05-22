import { randomBytes } from 'crypto'
import type { WorkspaceId, ConversationId, AuditLogId } from './ids.js'

export function generateId(): string {
  return randomBytes(16).toString('hex')
}

export function generateConversationId(): ConversationId {
  return randomBytes(16).toString('hex') as ConversationId
}

export function generateAuditLogId(): AuditLogId {
  return randomBytes(16).toString('hex') as AuditLogId
}

export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export function generateWorkspaceId(): WorkspaceId {
  return `ws-${randomBytes(12).toString('hex')}` as WorkspaceId
}
