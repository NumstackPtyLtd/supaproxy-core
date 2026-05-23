import { NotFoundError, ConflictError, ValidationError } from '../../domain/shared/errors.js'

export function handleDomainError(c: import('hono').Context, err: unknown): Response {
  if (err instanceof NotFoundError) return c.json({ error: 'not_found' }, 404)
  if (err instanceof ConflictError) return c.json({ error: 'conflict' }, 409)
  if (err instanceof ValidationError) return c.json({ error: 'validation_failed' }, 400)
  throw err
}
