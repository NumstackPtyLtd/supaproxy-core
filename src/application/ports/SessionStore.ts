export interface RoutingSession {
  workspaceId: string
  lastMessageAt: number
  routedFrom: string | null
  pendingRedirect?: boolean
}

export interface SessionStore {
  get(key: string): Promise<RoutingSession | null>
  set(key: string, session: RoutingSession, ttlSeconds: number): Promise<void>
  delete(key: string): Promise<void>
}

export function buildSessionKey(consumerType: string, entryPoint: string, userId: string): string {
  return `session:${consumerType}:${entryPoint}:${userId}`
}
