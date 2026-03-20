// app/api/agent/token/route.ts
import { NextRequest } from 'next/server'
import { randomBytes } from 'crypto'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Generate a new agent token for a server
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth()
    const body = await req.json()
    const { serverId } = body

    if (!serverId) return Response.json({ error: 'serverId required' }, { status: 400 })

    const server = await prisma.server.findFirst({ where: { id: serverId, userId: user.id } })
    if (!server) return Response.json({ error: 'Server not found' }, { status: 404 })

    // Delete old tokens for this server
    await prisma.agentToken.deleteMany({ where: { serverId } })

    // Create new token — 32 random bytes = 64 hex chars
    const token = randomBytes(32).toString('hex')
    const agentToken = await prisma.agentToken.create({
      data: { userId: user.id, serverId, token },
    })

    return Response.json({ token: agentToken.token, serverId, serverName: server.name })
  } catch (err: any) {
    if (err.message === 'Unauthorized') return Response.json({ error: 'Unauthorized' }, { status: 401 })
    return Response.json({ error: err.message }, { status: 500 })
  }
}

// List tokens for current user
export async function GET(_req: NextRequest) {
  try {
    const user = await requireAuth()
    const tokens = await prisma.agentToken.findMany({
      where: { userId: user.id },
      include: { server: { select: { id: true, name: true, host: true, status: true } } },
      orderBy: { createdAt: 'desc' },
    })
    return Response.json({ tokens })
  } catch (err: any) {
    if (err.message === 'Unauthorized') return Response.json({ error: 'Unauthorized' }, { status: 401 })
    return Response.json({ error: err.message }, { status: 500 })
  }
}
