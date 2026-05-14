import { z } from 'zod'
import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

interface ValidationSuccess<T> {
  success: true
  data: T
}

interface ValidationFailure {
  success: false
  response: Response & { status: ContentfulStatusCode }
}

type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure

export async function parseBody<T extends z.ZodType>(
  c: Context,
  schema: T
): Promise<ValidationResult<z.infer<T>>> {
  const body = await c.req.json().catch(() => ({}))
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    const fields: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      fields[issue.path.join('.') || '_root'] = issue.message
    }
    return {
      success: false,
      response: c.json({ error: 'validation_failed', fields }, 400) as Response & { status: ContentfulStatusCode },
    }
  }
  return { success: true, data: parsed.data }
}

export function validationError(c: Context, fields: Record<string, string>) {
  return c.json({ error: 'validation_failed', fields }, 400)
}
