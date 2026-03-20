// middleware.ts — Security gatekeeper
import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

function getSecret(): Uint8Array {
  const s = process.env.JWT_SECRET || 'dev-secret-change-in-production-min-32-chars'
  return new TextEncoder().encode(s)
}

const SEC_HEADERS: Record<string, string> = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
}

function addHeaders(res: NextResponse): NextResponse {
  Object.entries(SEC_HEADERS).forEach(([k, v]) => res.headers.set(k, v))
  if (process.env.NODE_ENV === 'production') {
    res.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
  }
  return res
}

function blocked(reason: string): NextResponse {
  return addHeaders(new NextResponse(`Forbidden: ${reason}`, { status: 403 }))
}

function isSuspicious(req: NextRequest): boolean {
  const ua = (req.headers.get('user-agent') || '').toLowerCase()
  if (['sqlmap', 'nikto', 'masscan', 'dirbuster', 'hydra', 'metasploit', 'zgrab'].some(s => ua.includes(s))) return true
  const path = req.nextUrl.pathname
  if (path.includes('../') || path.includes('%2e%2e') || path.includes('%00')) return true
  if (path.includes('wp-admin') || path.includes('.php') || path.includes('/.env')) return true
  if (path.includes('<script') || path.includes('javascript:')) return true
  return false
}

// Routes the agent uses — token auth not cookie
const AGENT_ROUTES  = ['/api/agent/push']
// Public auth routes
const PUBLIC_ROUTES = ['/api/auth/login', '/api/auth/register', '/api/auth/verify', '/api/auth/resend', '/auth/', '/home', '/']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Block scanners and malicious probes
  if (isSuspicious(req)) return blocked('scanner detected')

  // Skip static assets
  if (pathname.startsWith('/_next') || pathname.includes('.')) {
    return addHeaders(NextResponse.next())
  }

  // Agent routes use token auth — let through
  if (AGENT_ROUTES.some(r => pathname.startsWith(r))) {
    return addHeaders(NextResponse.next())
  }

  // Public routes — just add headers
  if (PUBLIC_ROUTES.some(r => pathname.startsWith(r))) {
    return addHeaders(NextResponse.next())
  }

  // Dashboard and protected API routes need valid JWT
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/api/')) {
    const token = req.cookies.get('step2dev_auth')?.value

    if (!token) {
      if (pathname.startsWith('/api/')) {
        return addHeaders(Response.json({ error: 'Unauthorized' }, { status: 401 }) as NextResponse)
      }
      const login = new URL('/auth/login', req.url)
      login.searchParams.set('from', pathname)
      return addHeaders(NextResponse.redirect(login))
    }

    try {
      await jwtVerify(token, getSecret())
      return addHeaders(NextResponse.next())
    } catch {
      if (pathname.startsWith('/api/')) {
        return addHeaders(Response.json({ error: 'Session expired' }, { status: 401 }) as NextResponse)
      }
      const res = NextResponse.redirect(new URL('/auth/login', req.url))
      res.cookies.set('step2dev_auth', '', {
        maxAge: 0, path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
      })
      return addHeaders(res)
    }
  }

  return addHeaders(NextResponse.next())
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.svg).*)'],
}
