// lib/env.ts
function get(key: string, fallback?: string): string {
  const val = process.env[key]
  if (!val) {
    if (fallback !== undefined) return fallback
    console.warn(`[env] Missing environment variable: ${key}`)
    return ''
  }
  return val
}

export const env = {
  DATABASE_URL:   get('DATABASE_URL'),
  JWT_SECRET:     get('JWT_SECRET', 'dev-secret-change-in-production'),
  ENCRYPTION_KEY: get('ENCRYPTION_KEY', ''),
  GROQ_API_KEY:   get('GROQ_API_KEY', ''),
  NODE_ENV:       get('NODE_ENV', 'development'),
  isProduction:   process.env.NODE_ENV === 'production',
}
