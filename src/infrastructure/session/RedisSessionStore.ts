import Redis from 'ioredis'
import type { SessionStore, RoutingSession } from '../../application/ports/SessionStore.js'

export class RedisSessionStore implements SessionStore {
  private readonly client: Redis

  constructor(host: string, port: number) {
    this.client = new Redis({ host, port, lazyConnect: true })
  }

  async get(key: string): Promise<RoutingSession | null> {
    const raw = await this.client.get(key)
    if (!raw) return null
    return JSON.parse(raw) as RoutingSession
  }

  async set(key: string, session: RoutingSession, ttlSeconds: number): Promise<void> {
    await this.client.set(key, JSON.stringify(session), 'EX', ttlSeconds)
  }

  async delete(key: string): Promise<void> {
    await this.client.del(key)
  }
}
