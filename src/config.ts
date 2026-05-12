export const requireEnv = (name: string): string => {
  const val = process.env[name]
  if (!val) throw new Error(
    `Missing required environment variable: ${name}. ` +
    `Add it to your .env file (see .env.example for reference).`
  )
  return val
}

export const requireEnvInt = (name: string): number => {
  const val = requireEnv(name)
  const num = parseInt(val, 10)
  if (isNaN(num)) throw new Error(`Environment variable ${name} must be a valid integer, got: "${val}"`)
  return num
}

export const NODE_ENV = process.env.NODE_ENV ?? 'development'
export const IS_PRODUCTION = NODE_ENV === 'production'

export const JWT_SECRET = (() => {
  const secret = requireEnv('JWT_SECRET')
  if (secret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters. Generate with: openssl rand -hex 32')
  return secret
})()
export const CORS_ORIGINS = requireEnv('CORS_ORIGINS').split(',')
export const DASHBOARD_URL = requireEnv('DASHBOARD_URL')

// Cookie domain: derived from DASHBOARD_URL so cookies work across subdomains
// e.g. https://supaproxy.cloud → .supaproxy.cloud
export const COOKIE_DOMAIN = (() => {
  if (!DASHBOARD_URL) return undefined
  try {
    const host = new URL(DASHBOARD_URL).hostname
    return host.startsWith('.') ? host : `.${host}`
  } catch {
    return undefined
  }
})()
export const PORT = requireEnvInt('PORT')

// Database
export const DB_HOST = requireEnv('DB_HOST')
export const DB_PORT = requireEnvInt('DB_PORT')
export const DB_USER = requireEnv('DB_USER')
export const DB_PASSWORD = requireEnv('DB_PASSWORD')
export const DB_NAME = requireEnv('DB_NAME')

// Redis
export const REDIS_HOST = requireEnv('REDIS_HOST')
export const REDIS_PORT = requireEnvInt('REDIS_PORT')

// Audit
export const LOG_DIR = process.env.SUPAPROXY_LOG_DIR

