// app/api/auth/resend/route.ts
import { NextRequest } from 'next/server'
import { randomBytes } from 'crypto'
import { prisma } from '@/lib/prisma'
import { sendVerificationEmail } from '@/lib/email'
import { sanitizeEmail, checkIPRateLimit, getIP } from '@/lib/security'

export async function POST(req: NextRequest) {
  try {
    // ── Rate limit: 3 resends per IP per hour ─────────────────
    const ip = getIP(req)
    if (!checkIPRateLimit(ip, 'resend', 3, 60 * 60 * 1000)) {
      // Return OK silently — don't tell attacker they're blocked
      return Response.json({ ok: true })
    }

    const body  = await req.json()
    const email = sanitizeEmail(body.email)
    if (!email) return Response.json({ ok: true }) // silent

    const user = await prisma.user.findUnique({ where: { email } })
    // Always return OK — prevent email enumeration
    if (!user || user.emailVerified) return Response.json({ ok: true })

    // Prevent rapid resends — check if token is < 2 minutes old
    if (user.verifyTokenExp) {
      const tokenAge = new Date(user.verifyTokenExp).getTime() - Date.now()
      // If expires > 23h 58m from now, it was created < 2 min ago
      if (tokenAge > 23 * 3600000 + 58 * 60000) {
        return Response.json({ ok: true }) // silent throttle
      }
    }

    const verifyToken    = randomBytes(32).toString('hex')
    const verifyTokenExp = new Date(Date.now() + 24 * 60 * 60 * 1000)
    await prisma.user.update({ where: { id: user.id }, data: { verifyToken, verifyTokenExp } })
    await sendVerificationEmail(email, user.name, verifyToken)

    return Response.json({ ok: true })
  } catch {
    return Response.json({ ok: true }) // always silent
  }
}
