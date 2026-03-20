// app/api/auth/me/route.ts
import { NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth'

export async function GET(_req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    return Response.json({ user })
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
