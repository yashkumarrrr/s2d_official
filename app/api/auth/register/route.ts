// app/api/auth/register/route.ts
import { NextRequest } from 'next/server'
import { randomBytes } from 'crypto'
import { prisma } from '@/lib/prisma'
import { signToken, setAuthCookie } from '@/lib/auth'
import { sendVerificationEmail } from '@/lib/email'
import { sanitizeEmail, sanitizeString, checkIPRateLimit, getIP, safeError, LIMITS } from '@/lib/security'

export async function POST(req: NextRequest) {
  try {
    // ── Rate limit: 5 registrations per IP per hour ───────────
    const ip = getIP(req)
    if (!checkIPRateLimit(ip, 'register', 5, 60 * 60 * 1000)) {
      return Response.json(
        { error: 'Too many registrations from this IP. Try again in an hour.' },
        { status: 429, headers: { 'Retry-After': '3600' } }
      )
    }

    const body  = await req.json()
    const name  = sanitizeString(body.name, LIMITS.NAME_MAX)
    const email = sanitizeEmail(body.email)

    if (!name || name.length < 2)
      return Response.json({ error: 'Name must be at least 2 characters' }, { status: 400 })
    if (!email)
      return Response.json({ error: 'Valid email is required' }, { status: 400 })

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      if (!existing.emailVerified && process.env.RESEND_API_KEY) {
        // Resend without revealing they already exist
        const verifyToken    = randomBytes(32).toString('hex')
        const verifyTokenExp = new Date(Date.now() + 24 * 60 * 60 * 1000)
        await prisma.user.update({ where: { id: existing.id }, data: { verifyToken, verifyTokenExp } })
        await sendVerificationEmail(email, existing.name, verifyToken)
        return Response.json({ success: true, needsVerification: true })
      }
      return Response.json({ error: 'An account with this email already exists' }, { status: 409 })
    }

    const verifyToken    = randomBytes(32).toString('hex')
    const verifyTokenExp = new Date(Date.now() + 24 * 60 * 60 * 1000)
    const emailVerificationEnabled = !!process.env.RESEND_API_KEY

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: '',
        plan: 'free',
        emailVerified:  !emailVerificationEnabled,
        verifyToken:    emailVerificationEnabled ? verifyToken : null,
        verifyTokenExp: emailVerificationEnabled ? verifyTokenExp : null,
      },
    })

    if (emailVerificationEnabled) {
      await sendVerificationEmail(email, name, verifyToken)
      return Response.json({ success: true, needsVerification: true })
    }

    const sessionToken = randomBytes(32).toString('hex')
    await prisma.session.create({
      data: { userId: user.id, token: sessionToken, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
    })
    const jwt = await signToken({ userId: user.id, sessionToken })
    setAuthCookie(jwt)

    return Response.json({ success: true, user: { id: user.id, name: user.name, email: user.email, plan: user.plan } })
  } catch (err) {
    console.error('[register]', err)
    return Response.json({ error: safeError(err) }, { status: 500 })
  }
}
