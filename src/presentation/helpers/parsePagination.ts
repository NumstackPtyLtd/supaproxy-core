import { DEFAULT_PAGINATION_LIMIT, MAX_PAGINATION_LIMIT } from '../../defaults.js'

export function parsePagination(c: import('hono').Context) {
  const limit = c.req.query('limit') ? Math.min(Math.max(parseInt(c.req.query('limit')!, 10) || DEFAULT_PAGINATION_LIMIT, 1), MAX_PAGINATION_LIMIT) : DEFAULT_PAGINATION_LIMIT
  const page = parseInt(c.req.query('page') || '0', 10)
  const search = c.req.query('search') || undefined
  return { search, limit, page, offset: page * limit }
}
