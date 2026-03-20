// app/api/auth/verify/route.ts
import { NextRequest } from 'next/server'
import { randomBytes } from 'crypto'
import { prisma } from '@/lib/prisma'
import { signToken, setAuthCookie } from '@/lib/auth'
import { sendWelcomeEmail } from '@/lib/email'

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get('token')
    if (!token) {
      return Response.redirect(new URL('/auth/login?error=invalid-token', req.url))
    }

    const user = await prisma.user.findFirst({
      where: {
        verifyToken: token,
        verifyTokenExp: { gt: new Date() },
        emailVerified: false,
      },
    })

    if (!user) {
      return Response.redirect(new URL('/auth/login?error=expired-token', req.url))
    }

    // Mark verified + clear token
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, verifyToken: null, verifyTokenExp: null },
    })

    // Create session and log them in
    const sessionToken = randomBytes(32).toString('hex')
    await prisma.session.create({
      data: { userId: user.id, token: sessionToken, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
    })
    const jwt = await signToken({ userId: user.id, sessionToken })
    setAuthCookie(jwt)

    // Send welcome email
    sendWelcomeEmail(user.email, user.name).catch(() => {})

    return Response.redirect(new URL('/dashboard/aria?welcome=1', req.url))
  } catch (err: any) {
    console.error('[verify]', err)
    return Response.redirect(new URL('/auth/login?error=verify-failed', req.url))
  }
}
