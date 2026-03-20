// app/api/agent/push/route.ts
// This endpoint receives metrics pushed by the monitoring agent on the server.
// No user auth needed — uses agent token instead.
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isValidAgentToken, sanitizeFloat, sanitizeString, isSuspiciousRequest } from '@/lib/security'

export async function POST(req: NextRequest) {
  try {
    if (isSuspiciousRequest(req)) return Response.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json()
    const { token, cpuUsage, ramUsage, diskUsage, uptime, status, os, processes } = body

    // Validate token format (64 hex chars)
    if (!isValidAgentToken(token)) {
      return Response.json({ error: 'Agent token required' }, { status: 401 })
    }

    // Look up the agent token
    const agentToken = await prisma.agentToken.findUnique({
      where: { token },
      include: { server: true },
    })

    if (!agentToken) {
      return Response.json({ error: 'Invalid agent token' }, { status: 401 })
    }

    // Validate metric values
    const clamp = (v: unknown, min: number, max: number): number | null => {
      const n = parseFloat(String(v))
      if (isNaN(n)) return null
      return Math.min(Math.max(n, min), max)
    }

    const updateData: Record<string, unknown> = {
      status:      typeof status === 'string' ? status : 'online',
      lastCheckAt: new Date(),
    }

    if (cpuUsage  !== undefined) updateData.cpuUsage  = clamp(cpuUsage,  0, 100)
    if (ramUsage  !== undefined) updateData.ramUsage  = clamp(ramUsage,  0, 100)
    if (diskUsage !== undefined) updateData.diskUsage = clamp(diskUsage, 0, 100)
    if (uptime    !== undefined) updateData.uptime    = BigInt(Math.max(0, parseInt(String(uptime)) || 0))
    if (os        !== undefined) updateData.os        = String(os).slice(0, 64)

    // Update server metrics
    await prisma.server.update({
      where: { id: agentToken.serverId },
      data:  updateData,
    })

    // Update token last used
    await prisma.agentToken.update({
      where: { id: agentToken.id },
      data:  { lastUsedAt: new Date() },
    })

    return Response.json({
      ok: true,
      serverId:   agentToken.serverId,
      serverName: agentToken.server.name,
      updated:    Object.keys(updateData).filter(k => k !== 'lastCheckAt' && k !== 'status'),
    })
  } catch (err: any) {
    console.error('[agent/push]', err)
    return Response.json({ error: 'Push failed' }, { status: 500 })
  }
}
