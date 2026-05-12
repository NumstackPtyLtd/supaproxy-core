import jwt from 'jsonwebtoken'
import type { TokenService, TokenPayload } from '../../application/ports/TokenService.js'
import { JWT_EXPIRY } from '../../defaults.js'
import pino from 'pino'

const log = pino({ name: 'jwt-token-service' })

export class JwtTokenService implements TokenService {
  constructor(private readonly secret: string) {}

  sign(payload: TokenPayload): string {
    return jwt.sign(payload, this.secret, { expiresIn: JWT_EXPIRY })
  }

  verify(token: string): TokenPayload | null {
    try {
      return jwt.verify(token, this.secret) as TokenPayload
    } catch (err) {
      log.debug({ error: (err as Error).message }, 'Token verification failed')
      return null
    }
  }
}
