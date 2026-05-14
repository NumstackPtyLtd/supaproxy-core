import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import { z } from 'zod'
import { parseBody, validationError } from './validate.js'

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  age: z.number().int().optional(),
})

function createApp() {
  const app = new Hono()
  app.post('/test', async (c) => {
    const result = await parseBody(c, schema)
    if (!result.success) return result.response
    return c.json({ ok: true, data: result.data })
  })
  app.post('/manual-error', async (c) => {
    return validationError(c, { email: 'Invalid email' })
  })
  return app
}

describe('parseBody', () => {
  const app = createApp()

  it('returns parsed data for valid input', async () => {
    const res = await app.request('/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Alice', age: 30 }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.data).toEqual({ name: 'Alice', age: 30 })
  })

  it('returns 400 with field errors for invalid input', async () => {
    const res = await app.request('/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '' }),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('validation_failed')
    expect(body.fields.name).toBe('Name is required')
  })

  it('returns 400 for missing body', async () => {
    const res = await app.request('/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('validation_failed')
  })

  it('returns 400 for invalid JSON', async () => {
    const res = await app.request('/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    })
    expect(res.status).toBe(400)
  })

  it('strips unknown fields', async () => {
    const res = await app.request('/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Alice', unknown: 'field' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.name).toBe('Alice')
    expect(body.data.unknown).toBeUndefined()
  })

  it('handles optional fields', async () => {
    const res = await app.request('/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Alice' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.age).toBeUndefined()
  })
})

describe('validationError', () => {
  const app = createApp()

  it('returns 400 with custom field errors', async () => {
    const res = await app.request('/manual-error', { method: 'POST' })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('validation_failed')
    expect(body.fields.email).toBe('Invalid email')
  })
})
