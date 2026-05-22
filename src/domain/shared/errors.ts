export class DomainError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message)
    this.name = 'DomainError'
  }
}

export class NotFoundError extends DomainError {
  constructor(entity: string, id: string) {
    super(`${entity} not found: ${id}`, 'NOT_FOUND')
    this.name = 'NotFoundError'
  }
}

export class ConflictError extends DomainError {
  constructor(message: string) {
    super(message, 'CONFLICT')
    this.name = 'ConflictError'
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, public readonly fields?: Record<string, string>) {
    super(message, 'VALIDATION')
    this.name = 'ValidationError'
  }
}

export class AuthenticationError extends DomainError {
  constructor(message: string = 'Invalid credentials.') {
    super(message, 'AUTHENTICATION')
    this.name = 'AuthenticationError'
  }
}

export class ConfigurationError extends DomainError {
  constructor(message: string) {
    super(message, 'CONFIGURATION')
    this.name = 'ConfigurationError'
  }
}

export class InvalidTransitionError extends DomainError {
  constructor(from: string, to: string) {
    super(`Cannot transition from ${from} to ${to}`, 'INVALID_TRANSITION')
    this.name = 'InvalidTransitionError'
  }
}
