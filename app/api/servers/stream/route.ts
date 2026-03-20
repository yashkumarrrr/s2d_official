// app/api/servers/stream/route.ts
// Server-Sent Events endpoint — pushes live metrics to browser every 5 seconds
import { NextRequest } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  // Auth check
  const cookieStore = cookies()
  const token = cookieStore.get('step2dev_auth')?.value
  if (!token) return new Response('Unauthorized', { status: 401 })

  const payload = await verifyToken(token)
  if (!payload || typeof payload.userId !== 'string') {
    return new Response('Unauthorized', { status: 401 })
  }
  const userId = payload.userId

  const encoder = new TextEncoder()
  let closed = false

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch {}
      }

      // Send initial data immediately
      try {
        const servers = await prisma.server.findMany({
          where: { userId },
          select: {
            id: true, name: true, host: true, status: true, os: true,
            cpuUsage: true, ramUsage: true, diskUsage: true,
            uptime: true, lastCheckAt: true,
          },
          orderBy: { createdAt: 'asc' },
        })
        send({
          type: 'metrics',
          servers: servers.map(s => ({
            ...s,
            uptime: s.uptime?.toString() ?? null,
            lastCheckAt: s.lastCheckAt?.toISOString() ?? null,
          })),
          timestamp: new Date().toISOString(),
        })
      } catch (err) {
        send({ type: 'error', message: 'Failed to load servers' })
      }

      // Poll DB every 5 seconds and push updates
      const interval = setInterval(async () => {
        if (closed) { clearInterval(interval); return }
        try {
          const servers = await prisma.server.findMany({
            where: { userId },
            select: {
              id: true, name: true, host: true, status: true, os: true,
              cpuUsage: true, ramUsage: true, diskUsage: true,
              uptime: true, lastCheckAt: true,
            },
            orderBy: { createdAt: 'asc' },
          })
          send({
            type: 'metrics',
            servers: servers.map(s => ({
              ...s,
              uptime: s.uptime?.toString() ?? null,
              lastCheckAt: s.lastCheckAt?.toISOString() ?? null,
            })),
            timestamp: new Date().toISOString(),
          })
        } catch {}
      }, 5000)

      // Heartbeat every 20s to keep connection alive
      const heartbeat = setInterval(() => {
        if (closed) { clearInterval(heartbeat); return }
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'))
        } catch {}
      }, 20000)

      // Cleanup when client disconnects
      req.signal.addEventListener('abort', () => {
        closed = true
        clearInterval(interval)
        clearInterval(heartbeat)
        try { controller.close() } catch {}
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
