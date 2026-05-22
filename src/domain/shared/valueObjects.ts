import { ValidationError } from './errors.js'

export class Email {
  readonly value: string

  private constructor(value: string) {
    this.value = value
  }

  static create(raw: string): Email {
    const normalised = raw.trim().toLowerCase()
    if (!normalised || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalised)) {
      throw new ValidationError('Invalid email address')
    }
    return new Email(normalised)
  }

  toString(): string {
    return this.value
  }

  equals(other: Email): boolean {
    return this.value === other.value
  }
}

export class Money {
  readonly amountUsd: number

  private constructor(amountUsd: number) {
    this.amountUsd = amountUsd
  }

  static usd(amount: number): Money {
    if (amount < 0) {
      throw new ValidationError('Money amount cannot be negative')
    }
    return new Money(Math.round(amount * 1_000_000) / 1_000_000)
  }

  static zero(): Money {
    return new Money(0)
  }

  add(other: Money): Money {
    return Money.usd(this.amountUsd + other.amountUsd)
  }

  toString(): string {
    return `$${this.amountUsd.toFixed(6)}`
  }
}

export class Duration {
  readonly ms: number

  private constructor(ms: number) {
    this.ms = ms
  }

  static fromMs(ms: number): Duration {
    if (ms < 0) throw new ValidationError('Duration cannot be negative')
    return new Duration(ms)
  }

  static fromSeconds(seconds: number): Duration {
    return Duration.fromMs(seconds * 1000)
  }

  get seconds(): number {
    return Math.round(this.ms / 1000)
  }

  toString(): string {
    return `${this.ms}ms`
  }
}
