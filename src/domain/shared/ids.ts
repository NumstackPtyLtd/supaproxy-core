/**
 * Branded ID types: compile-time type safety, zero runtime cost.
 *
 * Prevents mixing workspace IDs with conversation IDs:
 *   function close(id: ConversationId): void
 *   close(workspaceId) // TypeScript error
 */

declare const brand: unique symbol
type Brand<T, B extends string> = T & { readonly [brand]: B }

export type WorkspaceId = Brand<string, 'WorkspaceId'>
export type ConversationId = Brand<string, 'ConversationId'>
export type OrganisationId = Brand<string, 'OrganisationId'>
export type UserId = Brand<string, 'UserId'>
export type AuditLogId = Brand<string, 'AuditLogId'>
export type TeamId = Brand<string, 'TeamId'>

export function workspaceId(value: string): WorkspaceId { return value as WorkspaceId }
export function conversationId(value: string): ConversationId { return value as ConversationId }
export function organisationId(value: string): OrganisationId { return value as OrganisationId }
export function userId(value: string): UserId { return value as UserId }
export function auditLogId(value: string): AuditLogId { return value as AuditLogId }
export function teamId(value: string): TeamId { return value as TeamId }
