// lib/security.ts — Enterprise security hardening
import { timingSafeEqual } from 'crypto'
import { NextRequest } from 'next/server'

// ── Input Limits ──────────────────────────────────────────────
export const LIMITS = {
  MESSAGE_MAX:    12000,
  ERROR_MAX:      8000,
  REPO_URL_MAX:   256,
  NAME_MAX:       128,
  EMAIL_MAX:      255,
  SERVER_NAME_MAX:128,
  HOST_MAX:       255,
  OS_MAX:         64,
  BODY_MAX:       65536,
}

// ── Sanitization ──────────────────────────────────────────────
export function sanitizeString(input: unknown, maxLen = 255): string {
  if (typeof input !== 'string') return ''
  return input.trim().slice(0, maxLen).replace(/[<>]/g, '')
}

export function sanitizeEmail(email: unknown): string | null {
  const s = sanitizeString(email, LIMITS.EMAIL_MAX).toLowerCase()
  if (!s) return null
  const re = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/
  return re.test(s) ? s : null
}

export function sanitizeUrl(url: unknown): string | null {
  const s = sanitizeString(url, LIMITS.REPO_URL_MAX)
  try {
    const p = new URL(s)
    if (!['http:', 'https:'].includes(p.protocol)) return null
    const host = p.hostname
    // Block SSRF — private IPs
    if (/^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(host)) return null
    return p.toString()
  } catch { return null }
}

export function sanitizeFloat(val: unknown, min = 0, max = 100): number | null {
  const n = parseFloat(String(val))
  if (isNaN(n)) return null
  return Math.min(Math.max(Math.round(n * 10) / 10, min), max)
}

export function sanitizeInt(val: unknown, min = 1, max = 65535): number | null {
  const n = parseInt(String(val))
  if (isNaN(n)) return null
  return n >= min && n <= max ? n : null
}

// ── Agent Token Validation ────────────────────────────────────
export function isValidAgentToken(token: unknown): boolean {
  return typeof token === 'string' && token.length === 64 && /^[a-f0-9]{64}$/.test(token)
}

// ── Timing-Safe Compare ───────────────────────────────────────
export function safeCompare(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a), bb = Buffer.from(b)
    if (ba.length !== bb.length) return false
    return timingSafeEqual(ba, bb)
  } catch { return false }
}

// ── IP Extraction ─────────────────────────────────────────────
export function getIP(req: NextRequest): string {
  return (
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-real-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  )
}

// ── In-memory IP rate limiting (no Redis needed) ──────────────
const ipStore = new Map<string, { count: number; resetAt: number }>()

export function checkIPRateLimit(
  ip: string,
  key: string,
  maxRequests: number,
  windowMs: number
): boolean {
  const storeKey = `${key}:${ip}`
  const now = Date.now()
  const entry = ipStore.get(storeKey)

  if (!entry || now > entry.resetAt) {
    ipStore.set(storeKey, { count: 1, resetAt: now + windowMs })
    return true
  }
  entry.count++
  return entry.count <= maxRequests
}

// Clean expired entries every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    ipStore.forEach((v, k) => {
      if (now > v.resetAt) ipStore.delete(k)
    })
  }, 300000)
}

// ── Suspicious Request Detection ─────────────────────────────
export function isSuspiciousRequest(req: NextRequest): boolean {
  const ua = (req.headers.get('user-agent') || '').toLowerCase()
  const scanners = ['sqlmap','nikto','masscan','dirbuster','hydra','metasploit','zgrab','nmap','burp']
  if (scanners.some(s => ua.includes(s))) return true
  const path = req.nextUrl.pathname
  if (path.includes('../') || path.includes('%2e%2e') || path.includes('%00')) return true
  if (path.includes('wp-admin') || path.includes('.php') || path.includes('/.env')) return true
  return false
}

// ── Prompt Injection Prevention ───────────────────────────────
export function sanitizeForAI(input: string): string {
  return input
    .replace(/ignore (all )?(previous|prior|above) instructions?/gi, '[filtered]')
    .replace(/system\s+prompt/gi, '[filtered]')
    .replace(/you are now/gi, '[filtered]')
    .replace(/forget everything/gi, '[filtered]')
    .replace(/act as (a )?different/gi, '[filtered]')
    .slice(0, LIMITS.MESSAGE_MAX)
}

// ── Error Sanitization — never leak internals ─────────────────
export function safeError(err: unknown): string {
  if (process.env.NODE_ENV !== 'production') {
    return err instanceof Error ? err.message : 'Unknown error'
  }
  if (err instanceof Error) {
    if (err.message.toLowerCase().includes('prisma') || err.message.includes('P2'))
      return 'Database error'
    if (err.message.includes('JWT') || err.message.includes('Unauthorized'))
      return 'Authentication error'
  }
  return 'Internal server error'
}

// ── Security Headers ─────────────────────────────────────────
export function getSecurityHeaders(): Record<string, string> {
  return {
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    ...(process.env.NODE_ENV === 'production' ? {
      'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
    } : {}),
  }
}

// ── SSRF Prevention ───────────────────────────────────────────
export function isPrivateHost(host: string): boolean {
  return /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|0\.0\.0\.0|::1)/.test(host)
}
