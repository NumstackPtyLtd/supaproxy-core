import { randomBytes } from 'crypto'

export function generateId(): string {
  return randomBytes(16).toString('hex')
}

export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export function generateWorkspaceId(): string {
  return `ws-${randomBytes(12).toString('hex')}`
}
