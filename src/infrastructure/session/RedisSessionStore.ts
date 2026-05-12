import Redis from 'ioredis'
import type { SessionStore, RoutingSession } from '../../application/ports/SessionStore.js'
import pino from 'pino'

const log = pino({ name: 'redis-session-store' })

export class RedisSessionStore implements SessionStore {
  private readonly client: Redis

  constructor(host: string, port: number) {
    this.client = new Redis({ host, port, lazyConnect: true })
  }

  async get(key: string): Promise<RoutingSession | null> {
    const raw = await this.client.get(key)
    if (!raw) return null
    try {
      return JSON.parse(raw) as RoutingSession
    } catch (err) {
      log.warn({ error: (err as Error).message, key }, 'Session parse failed')
      return null
    }
  }

  async set(key: string, session: RoutingSession, ttlSeconds: number): Promise<void> {
    await this.client.set(key, JSON.stringify(session), 'EX', ttlSeconds)
  }

  async delete(key: string): Promise<void> {
    await this.client.del(key)
  }
}
