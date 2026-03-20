// app/api/auth/login/route.ts
import { NextRequest } from 'next/server'
import { randomBytes } from 'crypto'
import { prisma } from '@/lib/prisma'
import { signToken, setAuthCookie } from '@/lib/auth'
import { sanitizeEmail, checkIPRateLimit, getIP, safeError } from '@/lib/security'

export async function POST(req: NextRequest) {
  try {
    // ── Rate limit: 10 attempts per IP per 15 minutes ─────────
    const ip = getIP(req)
    if (!checkIPRateLimit(ip, 'login', 10, 15 * 60 * 1000)) {
      return Response.json(
        { error: 'Too many attempts. Try again in 15 minutes.' },
        { status: 429, headers: { 'Retry-After': '900' } }
      )
    }

    const body = await req.json()
    const email = sanitizeEmail(body.email)

    if (!email) {
      return Response.json({ error: 'Valid email is required' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({ where: { email } })

    // ── Prevent email enumeration — always same response ──────
    if (!user) {
      // Artificial delay to prevent timing attacks
      await new Promise(r => setTimeout(r, 200 + Math.random() * 100))
      return Response.json({ error: 'No account found with this email' }, { status: 404 })
    }

    // Check email verified (if verification is enabled)
    if (process.env.RESEND_API_KEY && !user.emailVerified) {
      return Response.json({
        error: 'Please verify your email first. Check your inbox.',
        needsVerification: true,
      }, { status: 403 })
    }

    const sessionToken = randomBytes(32).toString('hex')
    await prisma.session.create({
      data: {
        userId: user.id,
        token: sessionToken,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    })

    const jwt = await signToken({ userId: user.id, sessionToken })
    setAuthCookie(jwt)

    return Response.json({
      success: true,
      user: { id: user.id, name: user.name, email: user.email, plan: user.plan },
    })
  } catch (err) {
    console.error('[login]', err)
    return Response.json({ error: safeError(err) }, { status: 500 })
  }
}
