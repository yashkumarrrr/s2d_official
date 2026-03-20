// app/api/servers/[id]/route.ts
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

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

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth()
    const server = await prisma.server.findFirst({ where: { id: params.id, userId: user.id } })
    if (!server) return Response.json({ error: 'Not found' }, { status: 404 })
    return Response.json({ server: serializeServer(server) })
  } catch (err: any) {
    if (err.message === 'Unauthorized') return Response.json({ error: 'Unauthorized' }, { status: 401 })
    return Response.json({ error: err.message }, { status: 500 })
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth()
    const server = await prisma.server.findFirst({ where: { id: params.id, userId: user.id } })
    if (!server) return Response.json({ error: 'Not found' }, { status: 404 })

    const body = await req.json()

    const updated = await prisma.server.update({
      where: { id: params.id },
      data: {
        name:      body.name      !== undefined ? body.name.trim()      : server.name,
        host:      body.host      !== undefined ? body.host.trim()      : server.host,
        port:      body.port      !== undefined ? parseInt(body.port)   : server.port,
        username:  body.username  !== undefined ? body.username.trim()  : server.username,
        status:    body.status    !== undefined ? body.status           : server.status,
        os:        body.os        !== undefined ? (body.os?.trim() || null) : server.os,
        cpuUsage:  body.cpuUsage  !== undefined ? (body.cpuUsage != null ? parseFloat(body.cpuUsage) : null) : server.cpuUsage,
        ramUsage:  body.ramUsage  !== undefined ? (body.ramUsage != null ? parseFloat(body.ramUsage) : null) : server.ramUsage,
        diskUsage: body.diskUsage !== undefined ? (body.diskUsage != null ? parseFloat(body.diskUsage) : null) : server.diskUsage,
        uptime:    body.uptime    !== undefined ? (body.uptime != null ? BigInt(Math.floor(body.uptime)) : null) : server.uptime,
        lastCheckAt: body.cpuUsage !== undefined ? new Date() : server.lastCheckAt,
      },
    })

    return Response.json({ server: serializeServer(updated) })
  } catch (err: any) {
    if (err.message === 'Unauthorized') return Response.json({ error: 'Unauthorized' }, { status: 401 })
    return Response.json({ error: err.message }, { status: 500 })
  }
}

// PATCH = same as PUT (for the agent script)
export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  return PUT(req, ctx)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth()
    const server = await prisma.server.findFirst({ where: { id: params.id, userId: user.id } })
    if (!server) return Response.json({ error: 'Not found' }, { status: 404 })
    await prisma.server.delete({ where: { id: params.id } })
    return Response.json({ success: true })
  } catch (err: any) {
    if (err.message === 'Unauthorized') return Response.json({ error: 'Unauthorized' }, { status: 401 })
    return Response.json({ error: err.message }, { status: 500 })
  }
}
