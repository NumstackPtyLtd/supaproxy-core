export interface RoutingSession {
  workspaceId: string
  lastMessageAt: number
  routedFrom: string | null
  routedFromConversationId?: string
  generalConversationId?: string
  pendingRedirect?: boolean
}

export interface SessionStore {
  get(key: string): Promise<RoutingSession | null>
  set(key: string, session: RoutingSession, ttlSeconds: number): Promise<void>
  delete(key: string): Promise<void>
  /** Increment a rate-limit counter and return the count before this request. Returns 0 if unavailable. */
  getRecentQueryCount(scope: string, windowSeconds: number): Promise<number>
}

export function buildSessionKey(consumerType: string, entryPoint: string, userId: string): string {
  return `session:${consumerType}:${entryPoint}:${userId}`
}
