// app/api/servers/route.ts
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// BigInt can't be serialized to JSON — convert everything safe
function serializeServer(s: any) {
  return {
    id:          s.id,
    name:        s.name,
    host:        s.host,
    port:        s.port,
    username:    s.username,
    status:      s.status,
    os:          s.os ?? null,
    cpuUsage:    s.cpuUsage ?? null,
    ramUsage:    s.ramUsage ?? null,
    diskUsage:   s.diskUsage ?? null,
    uptime:      s.uptime != null ? Number(s.uptime) : null,
    lastCheckAt: s.lastCheckAt ?? null,
    createdAt:   s.createdAt,
    updatedAt:   s.updatedAt,
  }
}

export async function GET(_req: NextRequest) {
  try {
    const user = await requireAuth()
    const servers = await prisma.server.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    })
    return Response.json({ servers: servers.map(serializeServer) })
  } catch (err: any) {
    if (err.message === 'Unauthorized') return Response.json({ error: 'Unauthorized' }, { status: 401 })
    return Response.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth()
    const body = await req.json()
    const { name, host, port, username, os, status, cpuUsage, ramUsage, diskUsage } = body

    if (!name || !host) {
      return Response.json({ error: 'Name and host are required' }, { status: 400 })
    }

    const server = await prisma.server.create({
      data: {
        userId:    user.id,
        name:      name.trim(),
        host:      host.trim(),
        port:      port ? parseInt(port) : 22,
        username:  username?.trim() || 'root',
        status:    status || 'unknown',
        os:        os?.trim() || null,
        cpuUsage:  cpuUsage  != null ? parseFloat(cpuUsage)  : null,
        ramUsage:  ramUsage  != null ? parseFloat(ramUsage)  : null,
        diskUsage: diskUsage != null ? parseFloat(diskUsage) : null,
      },
    })

    return Response.json({ server: serializeServer(server) }, { status: 201 })
  } catch (err: any) {
    if (err.message === 'Unauthorized') return Response.json({ error: 'Unauthorized' }, { status: 401 })
    return Response.json({ error: err.message }, { status: 500 })
  }
}
