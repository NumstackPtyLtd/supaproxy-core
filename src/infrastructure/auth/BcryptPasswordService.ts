import bcrypt from 'bcrypt'
import type { PasswordService } from '../../application/ports/PasswordService.js'

const BCRYPT_ROUNDS = 12
const LEGACY_HASH_DELIMITER = ':'
const MAX_BCRYPT_HASH_LENGTH = 200

export class BcryptPasswordService implements PasswordService {
  async hash(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_ROUNDS)
  }

  async verify(password: string, storedHash: string): Promise<boolean> {
    // Support legacy SHA256 hashes (salt:hash format) during migration
    if (storedHash.includes(LEGACY_HASH_DELIMITER) && storedHash.length < MAX_BCRYPT_HASH_LENGTH) {
      const { createHash } = await import('crypto')
      const [salt, hash] = storedHash.split(LEGACY_HASH_DELIMITER)
      const check = createHash('sha256').update(password + salt).digest('hex')
      return check === hash
    }
    return bcrypt.compare(password, storedHash)
  }
}
