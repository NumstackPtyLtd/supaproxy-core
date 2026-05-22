import { describe, it, expect } from 'vitest'
import { Email, Money, Duration } from './valueObjects.js'
import { ValidationError } from './errors.js'

describe('Email', () => {
  it('normalises to lowercase and trims', () => {
    const email = Email.create('  User@Example.COM  ')
    expect(email.value).toBe('user@example.com')
  })

  it('throws on invalid email', () => {
    expect(() => Email.create('not-an-email')).toThrow(ValidationError)
    expect(() => Email.create('')).toThrow(ValidationError)
    expect(() => Email.create('  ')).toThrow(ValidationError)
  })

  it('equals another email with same value', () => {
    const a = Email.create('test@example.com')
    const b = Email.create('TEST@example.com')
    expect(a.equals(b)).toBe(true)
  })

  it('toString returns the value', () => {
    expect(Email.create('a@b.com').toString()).toBe('a@b.com')
  })
})

describe('Money', () => {
  it('rounds to 6 decimal places', () => {
    const m = Money.usd(0.001050123456789)
    expect(m.amountUsd).toBe(0.00105)
  })

  it('throws on negative amount', () => {
    expect(() => Money.usd(-1)).toThrow(ValidationError)
  })

  it('zero creates a zero amount', () => {
    expect(Money.zero().amountUsd).toBe(0)
  })

  it('add combines two amounts', () => {
    const result = Money.usd(1.5).add(Money.usd(2.3))
    expect(result.amountUsd).toBe(3.8)
  })

  it('toString formats with dollar sign', () => {
    expect(Money.usd(1.5).toString()).toBe('$1.500000')
  })
})

describe('Duration', () => {
  it('creates from milliseconds', () => {
    const d = Duration.fromMs(1500)
    expect(d.ms).toBe(1500)
    expect(d.seconds).toBe(2)
  })

  it('creates from seconds', () => {
    const d = Duration.fromSeconds(3)
    expect(d.ms).toBe(3000)
  })

  it('throws on negative duration', () => {
    expect(() => Duration.fromMs(-1)).toThrow(ValidationError)
  })

  it('toString shows milliseconds', () => {
    expect(Duration.fromMs(250).toString()).toBe('250ms')
  })
})
