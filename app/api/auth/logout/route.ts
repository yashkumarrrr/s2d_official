// app/api/auth/logout/route.ts
import { NextRequest } from 'next/server'
import { clearAuthCookie, getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(_req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (user) {
      await prisma.session.deleteMany({ where: { userId: user.id } })
    }
    clearAuthCookie()
    return Response.json({ success: true })
  } catch {
    clearAuthCookie()
    return Response.json({ success: true })
  }
}
